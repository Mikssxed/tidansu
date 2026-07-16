using Tidansu.Domain.Entities;

namespace Tidansu.Application.Spaces.Dtos;

/// <summary>
/// The body of <c>PUT /api/spaces/{id}/fields</c> (D-6/OQ-2). This is a full-replace
/// <c>PUT</c> of the space's scalar fields, not a sparse <c>PATCH</c>: every field below
/// is required and is written on every call. <c>ColumnLabels: null</c> means "clear the
/// labels" — it is never interpreted as "leave unchanged", because the client always
/// sends the complete scalar set (there is no absent-vs-null ambiguity to resolve here;
/// see SC-4). Deliberately carries no Zones/Items — that is the whole point of this
/// endpoint (FR-7): renaming a space or switching its view mode must not require or
/// trigger a rewrite of that space's zone/item graph.
/// </summary>
public class SpaceFieldsDto
{
    public string Name { get; set; } = null!;
    public string Type { get; set; } = null!;
    public string ViewMode { get; set; } = null!;
    public string CanvasMode { get; set; } = null!;
    public int LayoutColumns { get; set; }
    public List<string>? ColumnLabels { get; set; }

    // Deliberately scalar-only (mirrors this DTO's own fields, not SpaceDto.FromEntity):
    // UpdateSpaceFieldsCommandHandler resolves the space via GetByIdWithoutContentAsync
    // (no Include of Zones/Items), so those collections would come back empty on the
    // entity — building a SpaceDto from it would emit misleading empty Zones/Items
    // instead of "not loaded". Returning this narrower DTO is the honest shape for what
    // was actually loaded and mutated.
    public static SpaceFieldsDto FromEntity(Space s) => new()
    {
        Name = s.Name,
        Type = s.Type,
        ViewMode = s.ViewMode,
        CanvasMode = s.CanvasMode,
        LayoutColumns = s.LayoutColumns,
        ColumnLabels = s.ColumnLabels is null ? null : [.. s.ColumnLabels],
    };
}
