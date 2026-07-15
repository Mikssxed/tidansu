namespace Tidansu.Domain.Constants;

// Why an item's photo can be rejected. Not wire values (unlike PlanLimitReasons) —
// nothing on the client keys off these, so an enum is the right shape.
public enum PhotoRejection
{
    None,
    Empty,
    Malformed,
    DisallowedType,
    NotAnImage,
    TooLarge,
}

// Validates an item's photo — a base64 data URL — without ever materialising a
// multi-MB byte[]. Pure and static: no DB, no mocks, span-based parsing (no regex —
// a regex over an attacker-controlled ~7 MB string is a ReDoS vector). Cheap rejects
// run strictly before expensive ones; a null photo (the overwhelmingly common case —
// most items have none) is the very first check, so the hot path is a single
// reference comparison. Sniffs the decoded header against real image magic bytes so
// a spoofed `data:image/png;base64,...` prefix around non-image content is caught —
// the declared media type must both be allow-listed and agree with what's sniffed.
public static class PhotoPolicy
{
    // Raw decoded-byte cap for a photo. 5 MB.
    public const int MaxPhotoBytes = 5 * 1024 * 1024; // 5_242_880

    // Cheap string-length reject that fires before any parsing/decoding. Base64
    // inflates N bytes to 4 * ceil(N / 3) chars: for MaxPhotoBytes that is
    // 4 * ceil(5_242_880 / 3) = 4 * 1_747_627 = 6_990_508. The + 32 is slack for the
    // longest allowed "data:image/xxx;base64," prefix (23 chars for "image/jpeg").
    // Any string longer than this is *definitely* over the decoded cap, so it is
    // rejected on length alone, before touching content. The exact cap is enforced
    // arithmetically later (see decoded-size check below) — base64's ~33% inflation
    // never counts against the user.
    public const int MaxDataUrlChars = 6_990_508 + 32; // 6_990_540

    private const string DataUrlPrefix = "data:";
    private const string Base64Suffix = ";base64";
    private const string MediaTypeJpeg = "image/jpeg";
    private const string MediaTypePng = "image/png";
    private const string MediaTypeWebp = "image/webp";

    // How many leading base64 chars we ever decode — 16 chars -> 12 bytes, enough to
    // sniff JPEG (3), PNG (8) or WebP (12, including the "WEBP" tag at offset 8).
    private const int SniffBase64Chars = 16;
    private const int SniffByteCount = 12;

    private static readonly byte[] PngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    private static readonly byte[] RiffSignature = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
    private static readonly byte[] WebpSignature = [0x57, 0x45, 0x42, 0x50]; // "WEBP" at offset 8

    // photo is the client-controlled value verbatim (a base64 data URL, or null/empty
    // for "no photo"). Never log or interpolate it — see the S-5 note on the caller.
    public static PhotoRejection Check(string? photo)
    {
        // 1. Absent photo — the overwhelmingly common case (most items have none, and
        // currently *every* item does — the SPA has no capture flow yet). Must stay
        // the first statement: this runs on every item of every debounced autosave.
        if (photo is null) return PhotoRejection.None;

        // 2. Present but blank.
        if (string.IsNullOrWhiteSpace(photo)) return PhotoRejection.Empty;

        // 3. Reject on string length alone before any parsing — see MaxDataUrlChars.
        if (photo.Length > MaxDataUrlChars) return PhotoRejection.TooLarge;

        // 4. Must be a data URL — rules out "javascript:...", bare URLs, etc.
        if (!photo.AsSpan().StartsWith(DataUrlPrefix, StringComparison.Ordinal)) return PhotoRejection.NotAnImage;

        // 5. Find the header/payload split. Bounded to the first 64 chars: a real
        // data-URL header ("data:image/jpeg;base64,") is a couple dozen chars, so an
        // unbounded IndexOf(',') would scan up to ~7 MB for a malformed input.
        var searchSpan = photo.AsSpan(0, Math.Min(64, photo.Length));
        var commaIndex = searchSpan.IndexOf(',');
        if (commaIndex < 0) return PhotoRejection.Malformed;

        var header = photo.AsSpan(0, commaIndex);
        var payload = photo.AsSpan(commaIndex + 1);

        // 6. The header must declare base64 encoding.
        if (!header.EndsWith(Base64Suffix, StringComparison.OrdinalIgnoreCase)) return PhotoRejection.NotAnImage;

        // 7. The declared media type must be one of the allow-listed raster formats.
        // "image/jpg" is deliberately NOT accepted — it isn't a registered MIME type.
        var declaredMediaType = header[DataUrlPrefix.Length..^Base64Suffix.Length];
        if (!TryNormalizeAllowedMediaType(declaredMediaType, out var normalizedMediaType))
        {
            return PhotoRejection.DisallowedType;
        }

        // 8. Payload must be non-empty and a valid base64 length.
        if (payload.Length == 0 || payload.Length % 4 != 0) return PhotoRejection.Malformed;

        // 9. Arithmetic decoded-size check — no decoding yet. Cap enforced exactly
        // here; MaxDataUrlChars above was only a cheap over-estimate.
        var padCount = CountTrailingPadding(payload);
        var decodedByteCount = payload.Length / 4 * 3 - padCount;
        if (decodedByteCount > MaxPhotoBytes) return PhotoRejection.TooLarge;

        // 10. Allocation-free charset/padding scan over the (now bounded, <= ~7 MB)
        // payload. Must run after steps 3 and 9 have already bounded the length.
        if (!IsValidBase64Payload(payload)) return PhotoRejection.Malformed;

        // 11. Decode only the first 16 base64 chars (12 bytes) and sniff the magic
        // bytes. This is what defeats a spoofed prefix — the declared media type
        // (already allow-listed at step 7) must also agree with what the content
        // actually is.
        Span<byte> header12 = stackalloc byte[SniffByteCount];
        var headerChars = payload[..Math.Min(SniffBase64Chars, payload.Length)];
        if (!Convert.TryFromBase64Chars(headerChars, header12, out var decodedCount))
        {
            return PhotoRejection.NotAnImage;
        }

        var sniffed = header12[..decodedCount];
        var sniffedMediaType = SniffMediaType(sniffed);
        if (sniffedMediaType is null || !string.Equals(sniffedMediaType, normalizedMediaType, StringComparison.Ordinal))
        {
            return PhotoRejection.NotAnImage;
        }

        return PhotoRejection.None;
    }

    private static bool TryNormalizeAllowedMediaType(ReadOnlySpan<char> mediaType, out string normalized)
    {
        if (mediaType.Equals(MediaTypeJpeg, StringComparison.OrdinalIgnoreCase))
        {
            normalized = MediaTypeJpeg;
            return true;
        }

        if (mediaType.Equals(MediaTypePng, StringComparison.OrdinalIgnoreCase))
        {
            normalized = MediaTypePng;
            return true;
        }

        if (mediaType.Equals(MediaTypeWebp, StringComparison.OrdinalIgnoreCase))
        {
            normalized = MediaTypeWebp;
            return true;
        }

        normalized = string.Empty;
        return false;
    }

    // Counts trailing '=' padding characters (0, 1 or 2) by inspecting only the last
    // two chars — O(1), no scan.
    private static int CountTrailingPadding(ReadOnlySpan<char> payload)
    {
        var count = 0;
        var length = payload.Length;
        if (length >= 1 && payload[length - 1] == '=') count++;
        if (length >= 2 && payload[length - 2] == '=') count++;
        return count;
    }

    // Validates the payload is well-formed base64: every char is in the base64
    // alphabet, with '=' padding (if any) confined to the trailing 1-2 chars. O(n),
    // allocation-free.
    private static bool IsValidBase64Payload(ReadOnlySpan<char> payload)
    {
        var dataLength = payload.Length;
        while (dataLength > 0 && payload[dataLength - 1] == '=' && payload.Length - dataLength < 2)
        {
            dataLength--;
        }

        for (var i = 0; i < dataLength; i++)
        {
            if (!IsBase64Char(payload[i])) return false;
        }

        return true;
    }

    private static bool IsBase64Char(char c) =>
        (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c is '+' or '/';

    // Sniffs real image magic bytes. Returns the matched allow-listed media type, or
    // null when nothing recognised matches. Scope note: this proves the *header* is
    // an allow-listed raster image; it does not prove the whole payload decodes. That
    // is the correct trade-off — the threat this defends against is script-bearing
    // content rendered as an <img> source (closed by requiring both an allow-listed
    // signature and agreement with the declared type), not a corrupt-but-honest photo
    // (which merely fails to render — a UX nit, not a security hole). A full decode
    // would need an imaging library and is itself a DoS amplifier.
    private static string? SniffMediaType(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF) return MediaTypeJpeg;
        if (bytes.Length >= 8 && bytes[..8].SequenceEqual(PngSignature)) return MediaTypePng;
        if (bytes.Length >= 12 && bytes[..4].SequenceEqual(RiffSignature) && bytes[8..12].SequenceEqual(WebpSignature))
        {
            return MediaTypeWebp;
        }

        return null;
    }
}
