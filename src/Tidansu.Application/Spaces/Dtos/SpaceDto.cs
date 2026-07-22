using Tidansu.Domain.Entities;

namespace Tidansu.Application.Spaces.Dtos;

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

    public static SpaceDto FromEntity(Space s) => new()
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
    };

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
