using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Spaces.Dtos;

// The GET /api/spaces list shape (B-16 / SC-3): no Items, no Zones, no photo/hasPhoto
// signal — there is no consumer for one in the SPA today (FR-1). SpaceCard.vue needs
// only counts + up to 6 preview colours, which is exactly what this carries.
public class SpaceSummaryDto
{
    public string Id { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string Type { get; set; } = null!;
    public string ViewMode { get; set; } = null!;
    public string CanvasMode { get; set; } = null!;
    public int LayoutColumns { get; set; }
    public List<string>? ColumnLabels { get; set; }
    public int ZoneCount { get; set; }
    public int ItemCount { get; set; }
    public List<string> PreviewColors { get; set; } = [];

    public static SpaceSummaryDto FromSummary(SpaceSummary s) => new()
    {
        Id = s.Id,
        Name = s.Name,
        Type = s.Type,
        ViewMode = s.ViewMode,
        CanvasMode = s.CanvasMode,
        LayoutColumns = s.LayoutColumns,
        ColumnLabels = s.ColumnLabels is null ? null : [.. s.ColumnLabels],
        ZoneCount = s.ZoneCount,
        ItemCount = s.ItemCount,
        PreviewColors = [.. s.PreviewColors],
    };
}
