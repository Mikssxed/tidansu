# Skill: Create CQRS Query

Use this for any operation that **reads data without side effects** (get, list, search).

---

## File Structure

Create two files in `Tidansu.Application/{Feature}/Queries/{QueryName}/`:

```
{QueryName}Query.cs
{QueryName}QueryHandler.cs
```

Optionally add a validator if input needs checking:
```
{QueryName}QueryValidator.cs
```

Example feature=`Tasks`, QueryName=`GetTasks`:
```
Tidansu.Application/Tasks/Queries/GetTasks/GetTasksQuery.cs
Tidansu.Application/Tasks/Queries/GetTasks/GetTasksQueryHandler.cs
```

---

## 1. Query (`{QueryName}Query.cs`)

```csharp
using MediatR;

namespace Tidansu.Application.{Feature}.Queries.{QueryName};

public class {QueryName}Query : IRequest<{ReturnType}>
{
    // Filter/search parameters
    public Guid? Id { get; set; }
    public string? SearchTerm { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}
```

**Return type guidance:**
- Single item → `IRequest<{Entity}Dto?>` or `IRequest<{Entity}Dto>`
- List → `IRequest<IEnumerable<{Entity}Dto>>`
- Paged result → `IRequest<PagedResult<{Entity}Dto>>`

---

## 2. Define the DTO

If no DTO exists for this entity, create one alongside the query or in `Dtos/`:

```csharp
namespace Tidansu.Application.{Feature}.Queries.{QueryName};

public class {Entity}Dto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    // Include only what the client needs
}
```

---

## 3. Handler (`{QueryName}QueryHandler.cs`)

```csharp
using AutoMapper;
using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Application.User;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces.Repositories;

namespace Tidansu.Application.{Feature}.Queries.{QueryName};

public class {QueryName}QueryHandler(
    ILogger<{QueryName}QueryHandler> logger,
    IMapper mapper,
    I{Entity}Repository {entity}Repository,
    IUserContext userContext
) : IRequestHandler<{QueryName}Query, {ReturnType}>
{
    public async Task<{ReturnType}> Handle({QueryName}Query request, CancellationToken cancellationToken)
    {
        var currentUser = userContext.GetCurrentUser();
        logger.LogInformation("Fetching {QueryName} for user {UserId}", currentUser.Id);

        var items = await {entity}Repository.GetAll(currentUser.Id);
        return mapper.Map<IEnumerable<{Entity}Dto>>(items);
    }
}
```

---

## 4. Add Repository Method (if needed)

Add the read method to the domain interface:
```csharp
// Tidansu.Domain/Interfaces/Repositories/I{Entity}Repository.cs
Task<IEnumerable<{Entity}>> GetAll(string userId);
Task<{Entity}?> GetById(Guid id, string userId);
```

Implement in `Tidansu.Infrastructure/Repositories/{Entity}Repository.cs`:
```csharp
public async Task<IEnumerable<{Entity}>> GetAll(string userId)
{
    return await dbContext.{Entities}
        .Where(e => e.UserId == userId)
        .ToListAsync();
}
```

---

## Query Rules

- **Never modify state** in a query handler
- **No side effects** — do not call services that write data
- Use `AsNoTracking()` in EF Core for read queries (better performance)
- Throw `NotFoundException` if a requested resource doesn't exist
- Throw `ForbidException` if the user doesn't own the requested resource
- Return DTOs, never raw domain entities
