# Architecture

Tidansu uses **Clean Architecture** with **CQRS** and **MediatR** on the backend, and **Vue 3 + Composition API** on the frontend.

> **Grounding:** the layer model below is accurate, but some file/type *names* in
> the older examples are stale SelfGrind leftovers (`TaskItem`, `TasksController`,
> `ITasksRepository`). The real domain is **Space → Zone → Item** (+ Account, Auth,
> Billing, Plans). For the current file-by-file exemplars to copy, see
> **`.claude/context/patterns.md`**.

---

## Backend Projects

```
Tidansu.Domain          ← no dependencies (innermost)
Tidansu.Application     ← depends on Domain
Tidansu.Infrastructure  ← depends on Domain (implements Domain interfaces)
Tidansu.API             ← depends on Application + Infrastructure
```

### Tidansu.Domain
- **Purpose:** Core business logic. Has zero dependencies on other projects.
- **Contains:**
  - `Entities/` — domain models (`Space`, `Zone`, `Item`, `User`, `MagicLinkToken`, `RefreshToken`, `ProcessedStripeEvent`)
  - `Enums/` — `Plan`; `Constants/` — plan logic (`PlanPolicy`, `PlanCaps`, `PlanLimits`, `PhotoPolicy`, `ItemCaps`)
  - `Exceptions/` — domain exceptions (`NotFoundException`, `ValidationException`, `ForbidException`, `AuthenticationException`, `PlanLimitException`, `MagicLinkThrottledException`, `BillingUnavailableException`, `EmailDeliveryException`)
  - `Interfaces/` + `Repositories/` — service & repository contracts (`ISpacesRepository`, `IJwtService`, `IBillingService`, `IEmailService`, …)

### Tidansu.Application
- **Purpose:** Use cases (CQRS). Orchestrates domain objects without knowing infrastructure details.
- **Contains:**
  - `{Feature}/Commands/{Name}/` — `{Name}Command.cs`, `{Name}CommandHandler.cs`, `{Name}CommandValidator.cs`
  - `{Feature}/Queries/{Name}/` — `{Name}Query.cs`, `{Name}QueryHandler.cs`
  - `{Feature}/Dtos/` — AutoMapper profiles
  - `User/` — `IUserContext`, `UserContext`, `CurrentUser` record
  - `Extensions/ServiceCollectionExtensions.cs` — registers MediatR, AutoMapper, FluentValidation, IUserContext

### Tidansu.Infrastructure
- **Purpose:** Persistence, external services. Implements domain interfaces.
- **Contains:**
  - `Persistence/TidansuDbContext.cs` — EF Core context extending `IdentityDbContext<User>`
  - `Repositories/` — repository implementations
  - `Services/` — `JwtService`, `EmailService`, `TaskAuthorizationService`
  - `Migrations/` — EF Core migrations
  - `Extensions/ServiceCollectionExtensions.cs` — registers DbContext, Identity, JWT, repos

### Tidansu.API
- **Purpose:** HTTP layer. Controllers delegate directly to MediatR.
- **Contains:**
  - `Controllers/` — `SpacesController`, `SpaceZonesController`, `SpaceItemsController`, `AccountController`, `AuthController`, `BillingController`, `PlansController`
  - `Middlewares/ErrorHandlingMiddleware.cs` — maps domain exceptions to HTTP responses
  - `Models/ApiOperationResult.cs` — standard response wrapper
  - `Extensions/WebApplicationBuilderExtensions.cs` — registers auth, Swagger, CORS, Serilog

---

## Request Flow (typical feature)

```
HTTP Request
    ↓
Controller (API layer)
    ↓  mediator.Send(command)
MediatR Pipeline
    ↓  FluentValidation behavior runs first
CommandHandler (Application layer)
    ↓  calls IUserContext, IMapper, IRepository
Repository Implementation (Infrastructure layer)
    ↓  EF Core
TidansuDbContext → SQL Server
    ↑
Returns result up the chain
    ↑
Controller wraps in ApiOperationResult
    ↑
HTTP Response
```

**Error path:** Domain exceptions (`NotFoundException`, `ForbidException`, `ValidationException`) bubble up through MediatR and are caught by `ErrorHandlingMiddleware`, which maps them to the appropriate HTTP status codes.

---

## Frontend

```
Tidansu.App/src/
├── views/               ← page-level components (one per route)
├── components/
│   ├── base/            ← shared UI primitives
│   ├── layout/          ← AppLayout, AppNav, PlainLayout
│   └── <feature>/       ← feature-specific components
├── composables/         ← useApiClient, useAuth, useForm, useNavigation
├── stores/              ← Pinia stores (useAuthStore)
├── router/              ← Vue Router with AppViews map + createRoute()
├── api/apiClient/       ← Kiota-generated TypeScript client (do not edit)
├── schemas/             ← Zod validation schemas
└── style.css            ← Tailwind v4 + theme tokens
```

Data flow: `View → Feature Component → Base Component`, props flow downward, events flow upward.

---

## Dependency Rules (must not be violated)

| Layer | May depend on |
|-------|--------------|
| Domain | Nothing |
| Application | Domain |
| Infrastructure | Domain |
| API | Application, Infrastructure |
| Frontend | HTTP API endpoints only |
