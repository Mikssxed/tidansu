using Tidansu.Domain.Constants;
using Xunit;

namespace Tidansu.Domain.Tests;

// The interface is the test surface: pure input in, PhotoRejection out — no DB, no
// mocks. Real base64 fixtures below are constructed from genuine magic bytes (not
// hand-waved) so the sniffing steps are proven against actual image headers, not
// assumptions about them.
public class PhotoPolicyTests
{
    // A real 1x1 PNG (89 50 4E 47 0D 0A 1A 0A header, verified below).
    private const string PngDataUrl =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

    // A minimal but structurally real JPEG: SOI (FF D8 FF) + a valid JFIF APP0
    // segment + EOI.
    private const string JpegDataUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==";

    // A minimal but structurally real WebP: "RIFF" + 4-byte size + "WEBP" — exactly
    // the 12 bytes PhotoPolicy sniffs, base64-encoded to exactly 16 chars.
    private const string WebpDataUrl = "data:image/webp;base64,UklGRgQAAABXRUJQ";

    // `<script>alert(1)</script>` declared as a PNG — the S-2 regression case: proves
    // the check reads sniffed content, not the client-declared label.
    private const string ScriptMislabelledAsPng = "data:image/png;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==";

    private const string SvgDataUrl =
        "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=";

    private const string HtmlDataUrl = "data:text/html;base64,PGh0bWw+PGJvZHk+aGk8L2JvZHk+PC9odG1sPg==";

    [Fact]
    public void Png_fixture_header_is_the_real_png_signature()
    {
        var bytes = Convert.FromBase64String(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");
        Assert.Equal(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }, bytes[..8]);
    }

    [Theory]
    [InlineData(null, PhotoRejection.None)] // absent photo — the overwhelmingly common case
    [InlineData("", PhotoRejection.Empty)]
    [InlineData("   ", PhotoRejection.Empty)]
    [InlineData(PngDataUrl, PhotoRejection.None)] // real PNG round-trips
    [InlineData(JpegDataUrl, PhotoRejection.None)] // real JPEG round-trips
    [InlineData(WebpDataUrl, PhotoRejection.None)] // real WebP round-trips
    [InlineData(SvgDataUrl, PhotoRejection.DisallowedType)] // deliberately excluded (script-injection vector)
    [InlineData(HtmlDataUrl, PhotoRejection.DisallowedType)]
    [InlineData("data:image/jpg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==", PhotoRejection.DisallowedType)] // not a real MIME type
    [InlineData("javascript:alert(1)", PhotoRejection.NotAnImage)] // not a data URL at all
    [InlineData(ScriptMislabelledAsPng, PhotoRejection.NotAnImage)] // the S-2 regression: sniff beats the label
    [InlineData("data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==", PhotoRejection.NotAnImage)] // real JPEG bytes declared as PNG — sniff must agree with the label
    [InlineData("data:image/png,SGVsbG8=", PhotoRejection.NotAnImage)] // missing ";base64" before the comma
    [InlineData("data:image/png;base64;more_header_but_no_comma_within_the_first_sixty_four_chars", PhotoRejection.Malformed)] // comma search is bounded to 64 chars
    [InlineData("data:image/png;base64,ABC", PhotoRejection.Malformed)] // payload length not a multiple of 4
    [InlineData("data:image/png;base64,!!!!", PhotoRejection.Malformed)] // not valid base64 charset
    [InlineData("data:image/png;base64,AB==CD==", PhotoRejection.Malformed)] // padding not confined to the trailing chars
    public void Check_returns_expected(string? photo, PhotoRejection expected)
    {
        var result = PhotoPolicy.Check(photo);
        Assert.Equal(expected, result);
    }

    [Fact]
    public void Check_rejects_a_string_longer_than_MaxDataUrlChars_on_length_alone()
    {
        var photo = "data:image/png;base64," + new string('A', PhotoPolicy.MaxDataUrlChars);
        Assert.Equal(PhotoRejection.TooLarge, PhotoPolicy.Check(photo));
    }

    [Fact]
    public void Check_rejects_a_decoded_size_one_byte_over_the_cap_via_the_arithmetic_check()
    {
        // Exactly one byte over MaxPhotoBytes, encoded with no padding (5_242_881 % 3
        // == 0), so this exercises step 9's exact arithmetic check rather than step
        // 3's cheap length pre-reject — the resulting data URL is comfortably under
        // MaxDataUrlChars.
        const int decodedBytes = PhotoPolicy.MaxPhotoBytes + 1;
        var payloadChars = decodedBytes / 3 * 4;
        var photo = "data:image/png;base64," + new string('A', payloadChars);
        Assert.True(photo.Length < PhotoPolicy.MaxDataUrlChars);

        Assert.Equal(PhotoRejection.TooLarge, PhotoPolicy.Check(photo));
    }

    [Fact]
    public void Check_accepts_a_decoded_size_exactly_at_the_cap()
    {
        // A real PNG signature followed by base64 filler, sized so the decoded
        // payload lands exactly at MaxPhotoBytes.
        var pngBytes = new byte[PhotoPolicy.MaxPhotoBytes];
        byte[] signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        signature.CopyTo(pngBytes, 0);
        var photo = "data:image/png;base64," + Convert.ToBase64String(pngBytes);

        Assert.Equal(PhotoRejection.None, PhotoPolicy.Check(photo));
    }

    [Fact]
    public void Constants_match_the_values_settled_at_the_requirements_gate()
    {
        Assert.Equal(5 * 1024 * 1024, PhotoPolicy.MaxPhotoBytes);
        Assert.Equal(6_990_508 + 32, PhotoPolicy.MaxDataUrlChars);
    }

    // ---- PhotoChangeBetween (B-15 / D-2) ------------------------------------------
    // Two traps pinned here: (null, "") must be Added, not None — "" is a photo per
    // today's `i.Photo is not null` count, not "no photo" (IsNullOrEmpty would be
    // wrong); and an identical resent photo must be None, or a downgraded Free user
    // can never again save a photo-bearing item unchanged.
    [Theory]
    [InlineData(null, null, PhotoChange.None)]
    [InlineData(null, PngDataUrl, PhotoChange.Added)]
    [InlineData(null, "", PhotoChange.Added)]              // the empty-string-is-a-photo trap
    [InlineData("a", "a", PhotoChange.None)]                // identical resend — must stay editable
    [InlineData("a", "b", PhotoChange.Replaced)]
    [InlineData("a", null, PhotoChange.Removed)]
    [InlineData("a", "", PhotoChange.Replaced)]
    public void PhotoChangeBetween_returns_expected(string? existing, string? incoming, PhotoChange expected)
    {
        Assert.Equal(expected, PhotoPolicy.PhotoChangeBetween(existing, incoming));
    }
}
