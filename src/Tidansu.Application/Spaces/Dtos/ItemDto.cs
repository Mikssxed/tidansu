using Tidansu.Domain.Entities;

namespace Tidansu.Application.Spaces.Dtos;

public class ItemDto
{
    public string Id { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string ZoneId { get; set; } = null!;
    public int Quantity { get; set; }
    public List<string> Tags { get; set; } = [];
    public string DateAdded { get; set; } = null!;
    public string? Expiry { get; set; }
    public string? Photo { get; set; }
    public int? SlotIndex { get; set; }
    public string Depth { get; set; } = null!;
    public int Level { get; set; }
    public string? Icon { get; set; }

    public static ItemDto FromEntity(Item i) => new()
    {
        Id = i.Id,
        Name = i.Name,
        ZoneId = i.ZoneId,
        Quantity = i.Quantity,
        Tags = [.. i.Tags],
        DateAdded = i.DateAdded,
        Expiry = i.Expiry,
        Photo = i.Photo,
        SlotIndex = i.SlotIndex,
        Depth = i.Depth,
        Level = i.Level,
        Icon = i.Icon,
    };

    public Item ToEntity(string spaceId) => new()
    {
        Id = Id,
        SpaceId = spaceId,
        Name = Name,
        ZoneId = ZoneId,
        Quantity = Quantity,
        Tags = [.. Tags],
        DateAdded = DateAdded,
        Expiry = Expiry,
        Photo = Photo,
        SlotIndex = SlotIndex,
        Depth = Depth,
        Level = Level,
        Icon = Icon,
    };
}
