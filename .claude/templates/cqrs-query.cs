// Template: CQRS Query
// Location: Tidansu.Application/{Feature}/Queries/{QueryName}/{QueryName}Query.cs
// Replace {Feature}, {QueryName}, {ReturnType}, {Entity}Dto placeholders

using MediatR;

namespace Tidansu.Application.{Feature}.Queries.{QueryName};

// DTO — only include fields the client needs
public class {Entity}Dto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

// Query request
public class {QueryName}Query : IRequest<IEnumerable<{Entity}Dto>>
// Options:
//   IRequest<IEnumerable<{Entity}Dto>>  — list of items
//   IRequest<{Entity}Dto?>              — single item (nullable)
//   IRequest<{Entity}Dto>               — single item (throws if not found)
{
    // Filter parameters
    public Guid? Id { get; set; }
    public string? SearchTerm { get; set; }

    // Pagination (add if needed)
    // public int Page { get; set; } = 1;
    // public int PageSize { get; set; } = 20;
}
