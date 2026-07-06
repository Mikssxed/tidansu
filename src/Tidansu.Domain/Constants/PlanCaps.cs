using Tidansu.Domain.Enums;

namespace Tidansu.Domain.Constants;

// The enforced caps for a plan and the single source of truth for them. A null
// numeric cap means "unlimited" (Pro); it serializes to JSON null and the frontend
// maps it back to Infinity. Photos/Sync are capability gates. Mirrors the presentation
// data in the frontend data/plans.ts, which now sources these values from /api/plans.
public sealed record PlanCaps(int? Spaces, int? Zones, int? Items, bool Photos, bool Sync)
{
    public static PlanCaps For(Plan plan) => plan switch
    {
        Plan.Pro => new PlanCaps(Spaces: null, Zones: null, Items: null, Photos: true, Sync: true),
        _ => new PlanCaps(Spaces: 2, Zones: 6, Items: 50, Photos: false, Sync: false),
    };
}
