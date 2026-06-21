using Tidansu.Domain.Entities;

namespace Tidansu.Application.Account.Dtos;

// Aggregate usage across the user's spaces (for the account page meters).
public class UsageDto
{
    public int Spaces { get; set; }
    public int Items { get; set; }
    public int FullestSpace { get; set; }

    public static UsageDto From(List<Space> spaces) => new()
    {
        Spaces = spaces.Count,
        Items = spaces.Sum(s => s.Items.Count),
        FullestSpace = spaces.Count == 0 ? 0 : spaces.Max(s => s.Items.Count),
    };
}
