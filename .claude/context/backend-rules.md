# Backend Rules

## CQRS Conventions

### Commands
- Modify state (create, update, delete)
- Class name: `{Name}Command` — e.g., `CreateTaskCommand`, `UpdateUserDetailsCommand`
- Inherits: `IRequest<Guid>` (returns id), `IRequest<TResponse>` (returns DTO), or `IRequest` (void-like)
- Location: `Tidansu.Application/{Feature}/Commands/{Name}/`

### Queries
- Read-only, no side effects
- Class name: `{Name}Query` — e.g., `GetTasksQuery`, `GetUserProfileQuery`
- Inherits: `IRequest<TResponse>` where TResponse is a DTO or list
- Location: `Tidansu.Application/{Feature}/Queries/{Name}/`

### Command/Query file triplet (always three files per operation)
```
{Name}Command.cs           ← the request object
{Name}CommandHandler.cs    ← the handler
{Name}CommandValidator.cs  ← FluentValidation validator
```

---

## MediatR Patterns

### Registering handlers
MediatR auto-discovers all `IRequest` and `IRequestHandler` implementations in the Application assembly. No manual registration needed.

```csharp
// Application/Extensions/ServiceCollectionExtensions.cs
services.AddMediatR(cfg =>
{
    cfg.RegisterServicesFromAssembly(applicationAssembly);
});
```

### Dispatching from controller
```csharp
[ApiController]
[Route("api/tasks")]
[Authorize]
public class TasksController(IMediator mediator) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> CreateTask([FromBody] CreateTaskCommand command)
    {
        await mediator.Send(command);
        return NoContent();
    }
}
```

### Handler pattern (primary constructor DI)
```csharp
public class CreateTaskCommandHandler(
    ILogger<CreateTaskCommandHandler> logger,
    IMapper mapper,
    ITasksRepository tasksRepository,
    IUserContext userContext
) : IRequestHandler<CreateTaskCommand, Guid>
{
    public async Task<Guid> Handle(CreateTaskCommand request, CancellationToken cancellationToken)
    {
        var currentUser = userContext.GetCurrentUser();
        logger.LogInformation("Creating task {@Task} for user {@User}", request, currentUser);
        var task = mapper.Map<TaskItem>(request);
        task.UserId = currentUser.Id;
        return await tasksRepository.Create(task);
    }
}
```

---

## Validation (FluentValidation)

Validators run automatically before the handler via MediatR pipeline behavior.

```csharp
public class CreateTaskCommandValidator : AbstractValidator<CreateTaskCommand>
{
    public CreateTaskCommandValidator()
    {
        RuleFor(c => c.Title)
            .NotEmpty()
            .MaximumLength(100);

        RuleFor(c => c.StartDate)
            .Must(date => date >= DateOnly.FromDateTime(DateTime.Today))
            .WithMessage("Start date cannot be in the past.")
            .LessThanOrEqualTo(c => c.EndDate)
            .WithMessage("Start date must be on or before end date.");
    }
}
```

Validation errors throw `Tidansu.Domain.Exceptions.ValidationException` and are caught by `ErrorHandlingMiddleware` → 400 BadRequest.

---

## AutoMapper

Define profiles in `Application/{Feature}/Dtos/{Feature}Profile.cs`:

```csharp
public class TasksProfile : Profile
{
    public TasksProfile()
    {
        CreateMap<CreateTaskCommand, TaskItem>()
            .ForMember(d => d.Schedule, opt => opt.MapFrom(src => new TaskSchedule
            {
                StartDate = src.StartDate,
                EndDate = src.EndDate,
                RepetitionType = src.RepetitionType,
                RepeatInterval = src.RepeatInterval,
                DaysOfWeek = src.DaysOfWeek
            }));
    }
}
```

AutoMapper is registered automatically by scanning the Application assembly.

---

## Repository Pattern

### Interface (Domain layer — no EF/DB references)
```csharp
// Tidansu.Domain/Interfaces/Repositories/ITasksRepository.cs
public interface ITasksRepository
{
    Task<Guid> Create(TaskItem taskItem);
    Task<TaskItem?> GetById(Guid id);
}
```

### Implementation (Infrastructure layer)
```csharp
// Tidansu.Infrastructure/Repositories/TasksRepository.cs
public class TasksRepository(TidansuDbContext dbContext) : ITasksRepository
{
    public async Task<Guid> Create(TaskItem taskItem)
    {
        dbContext.Tasks.Add(taskItem);
        await dbContext.SaveChangesAsync();
        return taskItem.Id;
    }
}
```

### Registration
```csharp
// Tidansu.Infrastructure/Extensions/ServiceCollectionExtensions.cs
services.AddScoped<ITasksRepository, TasksRepository>();
```

---

## Naming Conventions

| Concept | Convention | Example |
|---------|-----------|---------|
| Namespace | `Tidansu.{Layer}.{Feature}.{Type}.{Name}` | `Tidansu.Application.Tasks.Commands.CreateTask` |
| Command | `{Action}{Feature}Command` | `CreateTaskCommand` |
| Handler | `{Action}{Feature}CommandHandler` | `CreateTaskCommandHandler` |
| Query | `{Action}{Feature}Query` | `GetTasksQuery` |
| Validator | `{Action}{Feature}CommandValidator` | `CreateTaskCommandValidator` |
| Repository interface | `I{Feature}Repository` | `ITasksRepository` |
| Repository impl | `{Feature}Repository` | `TasksRepository` |
| Service interface | `I{Name}Service` | `IJwtService` |
| Service impl | `{Name}Service` | `JwtService` |
| Entity | Singular noun | `TaskItem`, `TaskSchedule` |
| DTO/Profile | `{Feature}Profile` | `TasksProfile` |

---

## Layer Responsibilities

| Layer | Allowed | Forbidden |
|-------|---------|-----------|
| Domain | Business rules, entities, value objects, exceptions, repository interfaces | EF Core, HTTP, Application services |
| Application | Use cases, CQRS handlers, validators, AutoMapper profiles, IUserContext | EF Core DbContext, concrete Infrastructure types |
| Infrastructure | EF Core, SQL, JWT, Email, repo implementations | Business logic (belongs in Domain/Application) |
| API | HTTP routing, MediatR dispatch, response shaping | Business logic, direct DB access |

---

## Error Handling

Throw domain exceptions from handlers or repositories. `ErrorHandlingMiddleware` maps them:

| Exception | HTTP Status |
|-----------|-------------|
| `ValidationException` | 400 Bad Request |
| `NotFoundException` | 404 Not Found |
| `ForbidException` | 403 Forbidden |
| `AuthenticationException` | 401 Unauthorized |
| Any other `Exception` | 500 Internal Server Error |

---

## User Context

Access the current user in handlers via `IUserContext`:

```csharp
var currentUser = userContext.GetCurrentUser();
// currentUser.Id — string (ASP.NET Identity user ID)
// currentUser.Email — string
// currentUser.username — string
// currentUser.Roles — IEnumerable<string>
// currentUser.IsInRole("Admin") — bool
```

---

## ApiOperationResult Response Wrapper

Controllers return `ApiOperationResult<T>` for consistent API responses:

```csharp
// No data
return ApiOperationResult.Ok();

// With data
return ApiOperationResult.Ok(response);

// Error (returned by middleware, not directly)
return ApiOperationResult.BadRequest("error message");
```
