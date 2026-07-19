namespace Tidansu.Application.Common;

// The first paged envelope in the codebase (B-16 FR-6/FR-9) — kept deliberately minimal
// so it's reusable beyond spaces. The client derives "has more" itself from
// Page * PageSize < TotalCount rather than this carrying a computed flag.
public class PagedResult<T>
{
    public IReadOnlyList<T> Items { get; set; } = [];
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalCount { get; set; }
}
