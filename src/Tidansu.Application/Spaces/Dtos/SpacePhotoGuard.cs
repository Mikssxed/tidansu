using Tidansu.Domain.Constants;
using Tidansu.Domain.Exceptions;

namespace Tidansu.Application.Spaces.Dtos;

// Handler-side (not FluentValidation) guard over Space.Items[i].Photo — see B-13 tech-tasks
// D-8. The plan-cap check (PlanPolicy.CheckNewSpace, or the granular
// CheckAddItem/CheckItemPhotoChange — see B-15 D-1/D-2; CheckSpaceMutation itself was
// retired in B-15 T-8) must run before this is called, so a Free user sending any
// photo — valid or invalid — still gets 403 {plan:["photos"]} rather than this guard's
// 400. Pure, no I/O: safe to call outside any lock, including B-12's sp_getapplock
// critical section.
internal static class SpacePhotoGuard
{
    // Fixed, static messages only — never interpolate item.Photo into an error message or
    // log line (S-5). The error *key* carries which item is at fault; the message carries
    // no attacker-controlled data.
    private const string EmptyMessage = "Photo must not be blank.";
    private const string MalformedMessage = "Photo is not a well-formed image data URL.";
    private const string DisallowedTypeMessage = "Photo must be a JPEG, PNG or WebP image.";
    private const string NotAnImageMessage = "Photo must be a JPEG, PNG or WebP image.";
    private const string TooLargeMessage = "Photo must be 5 MB or smaller.";

    // Throws Tidansu.Domain.Exceptions.ValidationException — the same type FluentValidation's
    // ValidationBehavior throws — naming every offending item before throwing once, matching
    // ValidationBehavior's "group all failures" semantics. No-op when every photo is
    // null/valid. space.Items is a flat list (no per-zone nesting).
    public static void ThrowIfInvalid(SpaceDto space)
    {
        Dictionary<string, string[]>? errors = null;

        for (var i = 0; i < space.Items.Count; i++)
        {
            var message = MessageForInvalid(space.Items[i].Photo);
            if (message is null) continue;

            errors ??= [];
            errors[$"Space.Items[{i}].Photo"] = [message];
        }

        if (errors is not null) throw new ValidationException(errors);
    }

    // Granular path (B-15 T-9): checks a single item's photo. errorKey is adapted by
    // the caller to identify the one item in the request (FR-12) — e.g. "Item.Photo" —
    // rather than an index into Space.Items.
    public static void ThrowIfInvalid(string? photo, string errorKey)
    {
        var message = MessageForInvalid(photo);
        if (message is null) return;

        throw new ValidationException(new Dictionary<string, string[]> { [errorKey] = [message] });
    }

    // The per-photo core both overloads share (T-27): one implementation of
    // rejection-to-message mapping, so B-13's ordering guarantee (gate before guard)
    // can't drift between the whole-space and single-item paths.
    private static string? MessageForInvalid(string? photo)
    {
        var rejection = PhotoPolicy.Check(photo);
        return rejection == PhotoRejection.None ? null : MessageFor(rejection);
    }

    private static string MessageFor(PhotoRejection rejection) => rejection switch
    {
        PhotoRejection.Empty => EmptyMessage,
        PhotoRejection.Malformed => MalformedMessage,
        PhotoRejection.DisallowedType => DisallowedTypeMessage,
        PhotoRejection.NotAnImage => NotAnImageMessage,
        PhotoRejection.TooLarge => TooLargeMessage,
        _ => MalformedMessage,
    };
}
