# Skill: Refactor Backend Feature

Use this when improving existing backend code: enforcing CQRS separation, correcting layer violations, or improving readability.

> **Grounding:** the `CreateTask`/`TaskItem`/`dbContext.Tasks`/`ITasksRepository`
> names in the before/after snippets below are **illustrative only** — the real
> domain is **Space → Zone → Item** and the reference handler is
> `AddZoneCommandHandler` (see `.claude/context/patterns.md`). The layering
> *principles* shown are correct, but note two Tidansu specifics the snippets
> gloss over: Spaces DTOs map via **static `ToEntity`/`FromEntity`** (not
> `mapper.Map<>`), and a correct mutating handler also enforces **owner-scope-first
> 404** and a **plan-gate before the mutation**.

---

## Common Refactoring Scenarios

### 1. Business logic in controller → move to handler

**Before (wrong):**
```csharp
// Controller
[HttpPost]
public async Task<IActionResult> CreateTask([FromBody] CreateTaskCommand command)
{
    var user = httpContextAccessor.HttpContext.User;
    var task = new TaskItem { Title = command.Title, UserId = user.Id };
    dbContext.Tasks.Add(task);
    await dbContext.SaveChangesAsync();
    return NoContent();
}
```

**After (correct):**
```csharp
// Controller — delegate only
[HttpPost]
public async Task<IActionResult> CreateTask([FromBody] CreateTaskCommand command)
{
    await mediator.Send(command);
    return NoContent();
}

// Handler — business logic lives here
public async Task<Unit> Handle(CreateTaskCommand request, CancellationToken cancellationToken)
{
    var currentUser = userContext.GetCurrentUser();
    var task = mapper.Map<TaskItem>(request);
    task.UserId = currentUser.Id;
    await tasksRepository.Create(task);
    return Unit.Value;
}
```

---

### 2. EF Core in handler → move to repository

**Before (wrong):**
```csharp
// Handler
public async Task<Guid> Handle(CreateTaskCommand request, CancellationToken cancellationToken)
{
    var task = mapper.Map<TaskItem>(request);
    dbContext.Tasks.Add(task);      // Infrastructure detail in Application layer!
    await dbContext.SaveChangesAsync();
    return task.Id;
}
```

**After (correct):**
```csharp
// Handler — uses repository abstraction
public async Task<Guid> Handle(CreateTaskCommand request, CancellationToken cancellationToken)
{
    var task = mapper.Map<TaskItem>(request);
    return await tasksRepository.Create(task);
}

// Repository — infrastructure detail stays in Infrastructure
public async Task<Guid> Create(TaskItem task)
{
    dbContext.Tasks.Add(task);
    await dbContext.SaveChangesAsync();
    return task.Id;
}
```

---

### 3. Missing validation → add FluentValidation validator

For any command/query without a validator, add `{Name}CommandValidator.cs` next to the command.

---

### 4. Infrastructure service injected into Application → use interface

```csharp
// Wrong — Application referencing concrete Infrastructure type
public class Handler(TidansuDbContext dbContext) ...

// Correct — Application uses Domain interface
public class Handler(ITasksRepository tasksRepository) ...
```

---

### 5. God handler → split into smaller commands

If a handler does multiple things, extract each concern into its own command/handler:

```
UpdateTaskAndSendNotificationHandler → split into:
  UpdateTaskCommandHandler
  SendTaskNotificationCommandHandler (if needed, or use domain event)
```

---

## Layer Violation Checklist

Before refactoring, verify:

- [ ] Domain entities contain no `using` statements referencing Application/Infrastructure/API
- [ ] Application handlers reference only `IRepository` interfaces, not concrete implementations
- [ ] Application handlers do not reference `DbContext`, `HttpContext`, or `SignInManager` directly
- [ ] Infrastructure repositories do not contain business logic
- [ ] Controllers contain only: DI of `IMediator`, `mediator.Send()`, `return` statements
- [ ] Validators only validate input — no business logic, no DB calls

---

## Naming Cleanup

| Issue | Fix |
|-------|-----|
| `Handle` method doing too much | Extract helper methods with descriptive names |
| Ambiguous command name | Rename to `{Verb}{Entity}Command` pattern |
| Missing `Validator` file | Add validator even if initially empty |
| Handlers in wrong folder | Move to `{Feature}/Commands/` or `{Feature}/Queries/` |
