using Tidansu.Domain.Constants;
using Tidansu.Domain.Exceptions;

namespace Tidansu.Application.Spaces.Dtos;

// Handler-side (not FluentValidation) guard over Space.Items[i].Photo — see B-13 tech-tasks
// D-8. The plan-cap check (PlanPolicy.CheckNewSpace / CheckSpaceMutation) must run before
// this is called, so a Free user sending any photo — valid or invalid — still gets
// 403 {plan:["photos"]} rather than this guard's 400. Pure, no I/O: safe to call outside
// any lock, including B-12's sp_getapplock critical section.
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
            var rejection = PhotoPolicy.Check(space.Items[i].Photo);
            if (rejection == PhotoRejection.None) continue;

            errors ??= [];
            errors[$"Space.Items[{i}].Photo"] = [MessageFor(rejection)];
        }

        if (errors is not null) throw new ValidationException(errors);
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
