using Tidansu.Domain.Entities;

namespace Tidansu.Application.Spaces.Dtos;

// B-26: request-only shape as of this task — the create body (POST /api/spaces).
// The response shape for the space root (GET /api/spaces/{id} AND the create
// response) is SpaceReadDto; this class has no FromEntity. Never add a
// server-computed field (e.g. an over-cap flag) here — a request DTO that also
// carries server-derived state is exactly the B-16 shared-DTO wipe trap (FR-2).
public class SpaceDto
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

    public Space ToEntity(string userId) => new()
    {
        Id = Id,
        UserId = userId,
        Name = Name,
        Type = Type,
        ViewMode = ViewMode,
        CanvasMode = CanvasMode,
        LayoutColumns = LayoutColumns,
        ColumnLabels = ColumnLabels is null ? null : [.. ColumnLabels],
        Zones = [.. Zones.Select(z => z.ToEntity(Id))],
        Items = [.. Items.Select(i => i.ToEntity(Id))],
    };

    // B-23: the create-a-space path must never trust dto.Id — it is server-assigned
    // (see CreateSpaceCommandHandler + ISpaceIdGenerator). Identical to ToEntity(userId)
    // above except the id comes from the caller, and every child zone/item is stamped
    // with that same server-assigned spaceId rather than the client's Id.
    public Space ToEntity(string userId, string spaceId) => new()
    {
        Id = spaceId,
        UserId = userId,
        Name = Name,
        Type = Type,
        ViewMode = ViewMode,
        CanvasMode = CanvasMode,
        LayoutColumns = LayoutColumns,
        ColumnLabels = ColumnLabels is null ? null : [.. ColumnLabels],
        Zones = [.. Zones.Select(z => z.ToEntity(spaceId))],
        Items = [.. Items.Select(i => i.ToEntity(spaceId))],
    };
}
