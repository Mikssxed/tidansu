using Tidansu.Domain.Constants;
using Tidansu.Domain.Enums;

namespace Tidansu.Application.Plans.Dtos;

// The enforced caps for one plan, as served to the frontend. Numeric caps are null
// when unlimited (Pro); the client maps null → Infinity. Sourced from PlanCaps so the
// backend stays the single source of truth for the enforced numbers/gates.
public class PlanCapsDto
{
    public string Plan { get; set; } = null!;
    public int? Spaces { get; set; }
    public int? Zones { get; set; }
    public int? Items { get; set; }
    public bool Photos { get; set; }
    public bool Sync { get; set; }

    public static PlanCapsDto From(Plan plan)
    {
        var caps = PlanCaps.For(plan);
        return new PlanCapsDto
        {
            Plan = plan.ToString().ToLowerInvariant(),
            Spaces = caps.Spaces,
            Zones = caps.Zones,
            Items = caps.Items,
            Photos = caps.Photos,
            Sync = caps.Sync,
        };
    }
}
