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
}
