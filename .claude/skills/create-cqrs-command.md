# Skill: Create CQRS Command

Use this for any operation that **modifies state** (create, update, delete, process).

> **Grounding:** the real command triplet to copy is
> `Tidansu.Application/Spaces/Commands/AddZone/` (see `.claude/context/patterns.md`).
> The generic template below shows the *shape*; `AddZoneCommandHandler` shows the
> **required Tidansu invariants this template omits** — in a mutating handler:
> **(1)** resolve the user (`IUserContext` → `IUserService.FindByIdAsync`) and do an
> **owner-scoped** lookup that `throw new NotFoundException(...)` for an unknown or
> other-user id **before any other work**; **(2) plan-gate before the mutation**
> (`if (PlanPolicy.CheckX(user.Plan, …) is { } reason) throw new PlanLimitException(reason);`);
> **(3)** for finite (Free) caps, enforce the cap **atomically** in the repo. Spaces
> DTOs map via static `FromEntity`/`ToEntity`, **not** AutoMapper.

---

## File Structure

Create three files in `Tidansu.Application/{Feature}/Commands/{ActionName}/`:

```
{ActionName}Command.cs
{ActionName}CommandHandler.cs
{ActionName}CommandValidator.cs
```

Example feature=`Spaces`, ActionName=`AddZone`:
```
Tidansu.Application/Spaces/Commands/AddZone/AddZoneCommand.cs
Tidansu.Application/Spaces/Commands/AddZone/AddZoneCommandHandler.cs
Tidansu.Application/Spaces/Commands/AddZone/AddZoneCommandValidator.cs
```

---

## 1. Command (`{ActionName}Command.cs`)

```csharp
using MediatR;

namespace Tidansu.Application.{Feature}.Commands.{ActionName};

public class {ActionName}Command : IRequest<{ReturnType}>
{
    // Use 'required' for mandatory string/object properties
    public required string ExampleProperty { get; set; }

    // Use default values for optional properties
    public int OptionalCount { get; set; } = 0;
}
```

**Return type guidance:**
- Returns entity ID → `IRequest<Guid>`
- Returns a DTO → `IRequest<{Name}Response>`
- No return value → `IRequest` (void-like)

---

## 2. Handler (`{ActionName}CommandHandler.cs`)

```csharp
using AutoMapper;
using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Application.User;
using Tidansu.Domain.Entities;
using Tidansu.Domain.Repositories;   // repository interfaces live in Domain/Repositories/

namespace Tidansu.Application.{Feature}.Commands.{ActionName};

public class {ActionName}CommandHandler(
    ILogger<{ActionName}CommandHandler> logger,
    IMapper mapper,
    I{Entity}Repository {entity}Repository,
    IUserContext userContext
) : IRequestHandler<{ActionName}Command, {ReturnType}>
{
    public async Task<{ReturnType}> Handle({ActionName}Command request, CancellationToken cancellationToken)
    {
        var currentUser = userContext.GetCurrentUser();
        logger.LogInformation("Handling {ActionName} for user {@User}", currentUser);

        var entity = mapper.Map<{Entity}>(request);
        entity.UserId = currentUser.Id;

        var id = await {entity}Repository.Create(entity);
        return id;
    }
}
```

**Constructor guidelines:**
- Always inject `ILogger<{HandlerName}>`
- Only inject `IMapper` if mapping is needed
- Only inject `IUserContext` if the user is needed
- Inject only the repository interfaces you actually use

---

## 3. Validator (`{ActionName}CommandValidator.cs`)

```csharp
using FluentValidation;

namespace Tidansu.Application.{Feature}.Commands.{ActionName};

public class {ActionName}CommandValidator : AbstractValidator<{ActionName}Command>
{
    public {ActionName}CommandValidator()
    {
        RuleFor(c => c.ExampleProperty)
            .NotEmpty()
            .MaximumLength(100);

        // Add rules for each property that needs validation
    }
}
```

FluentValidation runs automatically before the handler via MediatR pipeline. Throws `ValidationException` on failure → 400 response.

---

## Conventions to Follow

- One class per file
- Primary constructor DI (no field assignments)
- Log at the start of `Handle()` with structured logging (`{@Property}` for objects)
- Throw domain exceptions (`NotFoundException`, `ForbidException`) — never catch and re-throw HTTP exceptions
- Never put business logic in the validator — only input validation
- Never put persistence logic in the handler — delegate to repository
