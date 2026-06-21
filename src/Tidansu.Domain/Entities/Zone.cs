namespace Tidansu.Domain.Entities;

public class Zone
{
    public string Id { get; set; } = null!;
    public string SpaceId { get; set; } = null!;

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

    // Free-canvas rect {x,y,w,h}; all-null when the zone hasn't been laid out.
    public double? RectX { get; set; }
    public double? RectY { get; set; }
    public double? RectW { get; set; }
    public double? RectH { get; set; }
}
