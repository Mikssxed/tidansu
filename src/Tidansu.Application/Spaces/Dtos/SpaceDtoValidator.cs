using FluentValidation;
using Tidansu.Domain.Constants;

namespace Tidansu.Application.Spaces.Dtos;

// FR-2 (space-level field lengths) + wires up the nested zone/item validators so
// FluentValidation produces indexed, field-attributed keys (e.g. "Items[3].Name")
// as FR-6 requires. Field lengths mirror TidansuDbContext's Space mapping verbatim.
public class SpaceDtoValidator : AbstractValidator<SpaceDto>
{
    public SpaceDtoValidator()
    {
        RuleFor(s => s.Id).NotEmpty().MaximumLength(64);
        RuleFor(s => s.Name).NotEmpty().MaximumLength(120);
        RuleFor(s => s.Type).NotEmpty().MaximumLength(16);
        RuleFor(s => s.ViewMode).NotEmpty().MaximumLength(16);
        RuleFor(s => s.CanvasMode).NotEmpty().MaximumLength(16);

        // B-22 FR-5 (defence-in-depth collection cap, S-4): the cap MUST run — and
        // short-circuit — before the per-element RuleForEach below. DependentRules
        // makes that structural rather than relying on declaration order; without it
        // FluentValidation would run ZoneDtoValidator across every element of an
        // oversized (~120,000-zone) attack payload before rejecting the collection.
        // The cap is a request-size bound, not a plan cap (SpaceCollectionCaps is not
        // PlanCaps) — it applies identically to Free and Pro, and sits far enough
        // above the Free per-space caps (6 zones / 50 items) that no legitimate Free
        // user ever reaches it before the plan-gate 403 would fire instead.
        // Cascade.Stop + NotNull mirrors ItemDtoValidator's Tags rule: an explicit
        // "zones": null overwrites the `= []` initializer and would NRE the Must
        // below. MVC's non-nullable-reference ModelState check rejects it as a 400
        // first, so this is defence in depth — it keeps the rule self-contained if
        // that implicit behaviour ever goes away. (B-22 review M2/S-M1.)
        RuleFor(s => s.Zones)
            .Cascade(CascadeMode.Stop)
            .NotNull()
            .Must(zones => zones.Count <= SpaceCollectionCaps.ZoneCollectionMax)
            .WithMessage($"Zones must not contain more than {SpaceCollectionCaps.ZoneCollectionMax} entries.")
            .DependentRules(() =>
            {
                RuleForEach(s => s.Zones).SetValidator(new ZoneDtoValidator());

                // B-22 FR-3/FR-5 (F-6): with the composite (SpaceId, Id) key, two
                // zones sharing an id within the SAME request throw an EF
                // change-tracker InvalidOperationException inside SpaceDto.ToEntity's
                // graph build — a 500 — before this rule existed. Reject it here as a
                // clean 400 instead.
                RuleFor(s => s.Zones)
                    .Must(zones => HasNoDuplicateIds(zones, z => z.Id))
                    .WithMessage("Zones must not contain duplicate ids.");
            });

        // Same Cascade.Stop + NotNull rationale as the Zones rule above.
        RuleFor(s => s.Items)
            .Cascade(CascadeMode.Stop)
            .NotNull()
            .Must(items => items.Count <= SpaceCollectionCaps.ItemCollectionMax)
            .WithMessage($"Items must not contain more than {SpaceCollectionCaps.ItemCollectionMax} entries.")
            .DependentRules(() =>
            {
                RuleForEach(s => s.Items).SetValidator(new ItemDtoValidator());

                // Same rationale as the Zones duplicate-id rule above, for Items.
                RuleFor(s => s.Items)
                    .Must(items => HasNoDuplicateIds(items, i => i.Id))
                    .WithMessage("Items must not contain duplicate ids.");
            });
    }

    // Shared by the Zones and Items duplicate-id rules above — one place to fix
    // means one place to get wrong (DRY, B-22 refactor).
    //
    // TRAP (B-22 review M1): this rule guards the composite (SpaceId, Id) primary
    // key, and that key is enforced by SQL Server under SQL_Latin1_General_CP1_CI_AS
    // — case-INsensitive, and trailing-whitespace-insensitive. A plain ordinal
    // Distinct() therefore under-matches the constraint it exists to protect: ids
    // "z1"/"Z1" (and "z1"/"z1 ") pass here, pass EF's equally-ordinal change
    // tracker, and then die at SaveChangesAsync as a PRIMARY KEY violation — a 500,
    // which is precisely what FR-3/FR-5 forbid. Normalise to the database's
    // comparison semantics instead of the CLR's default.
    //
    // Only this in-memory CreateSpace graph path needs it: the granular AddZone /
    // AddItem pre-checks (ZoneExistsInSpaceAsync / ItemExistsInSpaceAsync) evaluate
    // in SQL and so already inherit the CI collation.
    private static bool HasNoDuplicateIds<T>(IEnumerable<T> entries, Func<T, string> idSelector)
    {
        var ids = entries
            .Select(entry => idSelector(entry).TrimEnd())
            .ToList();
        return ids.Distinct(StringComparer.OrdinalIgnoreCase).Count() == ids.Count;
    }
}
