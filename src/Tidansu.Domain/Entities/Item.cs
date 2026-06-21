namespace Tidansu.Domain.Entities;

public class Item
{
    public string Id { get; set; } = null!;
    public string SpaceId { get; set; } = null!;

    public string Name { get; set; } = null!;
    // References Zone.Id within the same space (loose coupling, mirrors the client).
    public string ZoneId { get; set; } = null!;
    public int Quantity { get; set; }
    public List<string> Tags { get; set; } = [];
    // ISO timestamp / date strings, stored verbatim to match the client contract.
    public string DateAdded { get; set; } = null!;
    public string? Expiry { get; set; }
    public string? Photo { get; set; }
    public int? SlotIndex { get; set; }
    public string Depth { get; set; } = null!;
    public int Level { get; set; }
    public string? Icon { get; set; }
}
