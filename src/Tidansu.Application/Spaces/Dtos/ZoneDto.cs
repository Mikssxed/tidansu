using Tidansu.Domain.Entities;

namespace Tidansu.Application.Spaces.Dtos;

public class ZoneDto
{
    public string Id { get; set; } = null!;
    public int Position { get; set; }
    public string? Label { get; set; }
    public string Color { get; set; } = null!;
    public int GridCols { get; set; }
    public int GridRows { get; set; }
    public bool HasDepth { get; set; }
    public bool Floor { get; set; }
    public string Kind { get; set; } = null!;
    public string Facing { get; set; } = null!;
    public int Levels { get; set; }
    public int Column { get; set; }
    public RectDto? Rect { get; set; }

    public static ZoneDto FromEntity(Zone z) => new()
    {
        Id = z.Id,
        Position = z.Position,
        Label = z.Label,
        Color = z.Color,
        GridCols = z.GridCols,
        GridRows = z.GridRows,
        HasDepth = z.HasDepth,
        Floor = z.Floor,
        Kind = z.Kind,
        Facing = z.Facing,
        Levels = z.Levels,
        Column = z.Column,
        Rect = z.RectX is null ? null : new RectDto
        {
            X = z.RectX.Value,
            Y = z.RectY ?? 0,
            W = z.RectW ?? 0,
            H = z.RectH ?? 0,
        },
    };

    public Zone ToEntity(string spaceId) => new()
    {
        Id = Id,
        SpaceId = spaceId,
        Position = Position,
        Label = Label,
        Color = Color,
        GridCols = GridCols,
        GridRows = GridRows,
        HasDepth = HasDepth,
        Floor = Floor,
        Kind = Kind,
        Facing = Facing,
        Levels = Levels,
        Column = Column,
        RectX = Rect?.X,
        RectY = Rect?.Y,
        RectW = Rect?.W,
        RectH = Rect?.H,
    };
}
