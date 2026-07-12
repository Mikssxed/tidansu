---
name: create-api-endpoint
description: Expose a CQRS command or query as an HTTP endpoint for Tidansu. Use when adding a controller action.
---

# Skill: Create API Endpoint

Use this to expose a CQRS command or query as an HTTP endpoint.

---

## Locate the Right Controller

- Tasks → `Tidansu.API/Controllers/TasksController.cs`
- Identity/auth → `Tidansu.API/Controllers/IdentityController.cs`
- New domain area → create `Tidansu.API/Controllers/{Feature}Controller.cs`

---

## Controller Template

```csharp
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Tidansu.Application.{Feature}.Commands.{Name};
using Tidansu.API.Models;

namespace Tidansu.API.Controllers;

[ApiController]
[Route("api/{feature}")]
[Authorize]
public class {Feature}Controller(IMediator mediator) : ControllerBase
{
}
```

---

## Adding Actions

### POST — create resource
```csharp
[HttpPost]
[ProducesResponseType(StatusCodes.Status204NoContent)]
[ProducesResponseType(StatusCodes.Status400BadRequest)]
public async Task<IActionResult> Create{Feature}([FromBody] Create{Feature}Command command)
{
    await mediator.Send(command);
    return NoContent();
}
```

### POST — create with returned ID
```csharp
[HttpPost]
[ProducesResponseType(StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status400BadRequest)]
public async Task<Ok<ApiOperationResult<Guid>>> Create{Feature}([FromBody] Create{Feature}Command command)
{
    var id = await mediator.Send(command);
    return ApiOperationResult.Ok(id);
}
```

### GET — return list
```csharp
[HttpGet]
[ProducesResponseType(StatusCodes.Status200OK)]
public async Task<Ok<ApiOperationResult<IEnumerable<{Feature}Dto>>>> Get{Feature}s()
{
    var result = await mediator.Send(new Get{Feature}sQuery());
    return ApiOperationResult.Ok(result);
}
```

### GET — return single item
```csharp
[HttpGet("{id:guid}")]
[ProducesResponseType(StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
public async Task<Ok<ApiOperationResult<{Feature}Dto>>> Get{Feature}([FromRoute] Guid id)
{
    var result = await mediator.Send(new Get{Feature}Query { Id = id });
    return ApiOperationResult.Ok(result);
}
```

### PATCH — partial update
```csharp
[HttpPatch("{id:guid}")]
[ProducesResponseType(StatusCodes.Status204NoContent)]
[ProducesResponseType(StatusCodes.Status400BadRequest)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
public async Task<IActionResult> Update{Feature}([FromRoute] Guid id, [FromBody] Update{Feature}Command command)
{
    command.Id = id;
    await mediator.Send(command);
    return NoContent();
}
```

### DELETE
```csharp
[HttpDelete("{id:guid}")]
[ProducesResponseType(StatusCodes.Status204NoContent)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
public async Task<IActionResult> Delete{Feature}([FromRoute] Guid id)
{
    await mediator.Send(new Delete{Feature}Command { Id = id });
    return NoContent();
}
```

---

## Rules

- Controllers have **zero business logic** — delegate everything to MediatR
- Accept commands directly from `[FromBody]` — no manual mapping in controller
- Always add `[ProducesResponseType]` attributes for Swagger documentation
- Use `[Authorize]` on the class for controllers that require authentication
- Use `[AllowAnonymous]` on specific actions that are public within an `[Authorize]` controller
- `ErrorHandlingMiddleware` handles exceptions — do not wrap in try/catch

---

## Response Patterns

```csharp
// No data
return NoContent();

// With data
return ApiOperationResult.Ok(data);

// Typed Ok with data
return TypedResults.Ok(new ApiOperationResult<T> { Data = data, IsSuccess = true });
```
