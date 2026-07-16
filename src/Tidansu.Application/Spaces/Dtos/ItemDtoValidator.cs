using FluentValidation;
using Tidansu.Domain.Constants;

namespace Tidansu.Application.Spaces.Dtos;

// FR-1 (field lengths) + FR-3 (tag bounds) only. Field lengths mirror
// TidansuDbContext's Item mapping verbatim. The photo (FR-4/FR-5) is deliberately
// NOT validated here — it's plan-gated, so it's checked in the handler via
// SpacePhotoGuard, after the PlanPolicy gate (see B-13 tech-tasks D-8.5).
public class ItemDtoValidator : AbstractValidator<ItemDto>
{
    public ItemDtoValidator()
    {
        RuleFor(i => i.Id).NotEmpty().MaximumLength(64);
        RuleFor(i => i.Name).NotEmpty().MaximumLength(200);
        // ZoneId has no FK, so there is no referential check *here* — length only.
        // As of B-15 the granular handlers DO verify the zone exists in the space
        // (ZoneExistsInSpaceAsync, FR-4/FR-5); that check lives in the handler, not this
        // validator, because ValidationBehavior runs first and a 400 here would preempt
        // the plan gate's 403 paywall (B-13's ordering). Loose at the DB and DTO layer,
        // enforced at the handler.
        RuleFor(i => i.ZoneId).NotEmpty().MaximumLength(64);
        RuleFor(i => i.DateAdded).NotEmpty().MaximumLength(40);
        RuleFor(i => i.Expiry).MaximumLength(40); // string? — MaximumLength skips nulls.
        RuleFor(i => i.Depth).NotEmpty().MaximumLength(16);
        RuleFor(i => i.Icon).MaximumLength(40); // string? — MaximumLength skips nulls.

        // Defence in depth, not a live fix: an explicit "tags": null overwrites the `= []`
        // initializer, which would NRE the Must below — but MVC's non-nullable-reference
        // ModelState check rejects it as a 400 first (verified by driving it with this rule
        // removed). This keeps the rule self-contained if that implicit behaviour ever goes
        // away. Cascade.Stop keeps Must off a null list.
        RuleFor(i => i.Tags)
            .Cascade(CascadeMode.Stop)
            .NotNull()
            .Must(tags => tags.Count <= ItemCaps.MaxTags)
            .WithMessage($"'{{PropertyName}}' must contain no more than {ItemCaps.MaxTags} items.");
        RuleForEach(i => i.Tags).MaximumLength(ItemCaps.MaxTagLength);
    }
}
