namespace Tidansu.Application.Account.Dtos;

// Aggregate usage across the user's spaces (for the account page meters).
public class UsageDto
{
    public int Spaces { get; set; }
    public int Items { get; set; }
    public int FullestSpace { get; set; }

    public static UsageDto From(List<int> itemCountsPerSpace) => new()
    {
        Spaces = itemCountsPerSpace.Count,
        Items = itemCountsPerSpace.Sum(),
        FullestSpace = itemCountsPerSpace.Count == 0 ? 0 : itemCountsPerSpace.Max(),
    };
}
