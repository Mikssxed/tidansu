using Tidansu.Domain.Entities;

namespace Tidansu.Application.Spaces.Dtos;

// B-26: the sole response shape for the space root (GET /api/spaces/{id} AND
// POST /api/spaces) — SpaceDto stays the create request body only (see its header
// comment). This carries the full photo-less graph (zones + items) plus the
// server-authoritative over-cap flag.
public class SpaceReadDto
{
    public string Id { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string Type { get; set; } = null!;
    public string ViewMode { get; set; } = null!;
    public string CanvasMode { get; set; } = null!;
    public int LayoutColumns { get; set; }
    public List<string>? ColumnLabels { get; set; }
    public List<ZoneDto> Zones { get; set; } = [];
    public List<ItemDto> Items { get; set; } = [];

    // B-26 (mirrors SpaceSummaryDto.IsOverCap, B-25): server-authoritative "this
    // whole space is one of the account's excess spaces and is read-only" —
    // computed with the SAME PlanPolicy.CheckSpaceContentMutation predicate
    // SpaceOverCapGuard enforces with (via SpaceOverCapGuard.IsSpaceOverCapAsync).
    // The SPA must badge from this and never derive over-cap client-side.
    public bool IsOverCap { get; set; }

    public static SpaceReadDto FromEntity(Space s, bool isOverCap) => new()
    {
        Id = s.Id,
        Name = s.Name,
        Type = s.Type,
        ViewMode = s.ViewMode,
        CanvasMode = s.CanvasMode,
        LayoutColumns = s.LayoutColumns,
        ColumnLabels = s.ColumnLabels is null ? null : [.. s.ColumnLabels],
        Zones = [.. s.Zones.OrderBy(z => z.Position).Select(ZoneDto.FromEntity)],
        Items = [.. s.Items.Select(ItemDto.FromEntity)],
        IsOverCap = isOverCap,
    };
}
