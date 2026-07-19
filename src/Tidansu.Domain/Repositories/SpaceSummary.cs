namespace Tidansu.Domain.Repositories;

// The list-page read shape for GetSpaceSummariesPageAsync (B-16 / SC-3): a projection,
// not an entity — mirrors ContentInsertOutcome (a repository-owned Domain type) and the
// List<int> projection returned by GetItemCountsPerSpaceAsync. Carries no zones, items,
// or photo payload; ZoneCount/ItemCount are SQL COUNT(*)s and PreviewColors is the first
// six zone colours ordered by Zone.Position — exactly what SpaceCard.vue renders.
public record SpaceSummary(
    string Id,
    string Name,
    string Type,
    string ViewMode,
    string CanvasMode,
    int LayoutColumns,
    List<string>? ColumnLabels,
    int ZoneCount,
    int ItemCount,
    IReadOnlyList<string> PreviewColors);
