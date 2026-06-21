namespace Tidansu.Domain.Entities;

// Mirrors the frontend Space shape (data/types.ts). Ids are the client-generated
// uids (e.g. "space_…") so zone/item references round-trip unchanged. Union-typed
// fields (type/viewMode/canvasMode) are stored as their lowercase string literals.
public class Space
{
    public string Id { get; set; } = null!;
    public string UserId { get; set; } = null!;
    public User User { get; set; } = null!;

    public string Name { get; set; } = null!;
    public string Type { get; set; } = null!;
    public string ViewMode { get; set; } = null!;
    public string CanvasMode { get; set; } = null!;
    public int LayoutColumns { get; set; }
    public List<string>? ColumnLabels { get; set; }

    public List<Zone> Zones { get; set; } = [];
    public List<Item> Items { get; set; } = [];
}
