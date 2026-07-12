# Project Overview

## What is Tidansu?

Tidansu is a task management and self-improvement application with gamification. Users create tasks with XP rewards and attribute categories (Strength, Knowledge, Health, etc.). Completing tasks rewards XP and tracks character progression.

---

## Technology Stack

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| .NET | 10.0 | Runtime |
| ASP.NET Core | 10.0 | Web API |
| Entity Framework Core | 10.0 | ORM |
| SQL Server LocalDB | — | Development database |
| MediatR | 14.0 | CQRS mediator |
| FluentValidation | 11.3 | Request validation |
| AutoMapper | 12.0 | Object mapping |
| ASP.NET Identity | 10.0 | User auth + roles |
| Serilog | 10.0 | Structured logging |
| Swashbuckle | 10.1 | OpenAPI/Swagger |

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| Vue 3 | latest | UI framework |
| TypeScript | latest | Type safety |
| Vite | latest | Build tool |
| Tailwind CSS | v4 | Styling |
| PrimeVue | latest (unstyled) | Component library base |
| Pinia | latest | State management |
| TanStack Query (Vue) | latest | Server state / mutations |
| Kiota | latest | Generated API client |
| vee-validate | latest | Form validation |
| Zod | latest | Schema validation |
| tailwind-merge | latest | Class merging |

---

## Repository Layout

```
Tidansu/
├── src/
│   ├── Tidansu.API/               ← HTTP layer (controllers, middleware)
│   ├── Tidansu.Application/       ← CQRS handlers, validators, AutoMapper
│   ├── Tidansu.Domain/            ← Entities, exceptions, repository interfaces
│   ├── Tidansu.Infrastructure/    ← EF Core, repositories, JWT, email
│   └── Tidansu.App/               ← Vue 3 frontend
│       └── src/
│           ├── api/apiClient/       ← Kiota-generated client (do not edit)
│           ├── components/
│           │   ├── base/            ← shared UI primitives
│           │   ├── layout/
│           │   └── <feature>/       ← domain-specific components
│           ├── composables/
│           ├── router/
│           ├── stores/
│           ├── views/
│           └── style.css            ← Tailwind v4 + theme tokens
├── CLAUDE.md                        ← Claude instructions
└── .pi/                         ← Claude context, skills, templates
    ├── context/
    ├── skills/
    └── templates/
```

---

## Key Domain Concepts

| Concept | Description |
|---------|-------------|
| `TaskItem` | A user-created task with title, description, XP reward, and attribute |
| `TaskSchedule` | Recurrence settings for a task (once, daily, weekly) |
| `TaskOccurrence` | A single scheduled instance of a task (pending/completed) |
| `BaseAttribute` | Enum: Strength, Knowledge, Health, Charisma, Focus, Creativity |
| `TaskRepetitionType` | Enum: Once, Daily, Weekly |
| `User` | ASP.NET Identity user with task relationships |

---

## Dev Environment

```bash
# Backend — from src/Tidansu.API
dotnet run                  # start API on http://localhost:5081
dotnet watch run            # with hot reload

# Frontend — from src/Tidansu.App
npm run dev                 # Vite dev server on http://localhost:5173
npm run build               # type-check + build
npm run build:api           # regenerate Kiota client from swagger

# EF Core migrations — from repo root
dotnet ef migrations add <Name> \
    --project src/Tidansu.Infrastructure \
    --startup-project src/Tidansu.API
```

**Important:** Start the backend before the frontend. Vite proxies `/api` to `http://localhost:5081/`.

`VITE_DISABLE_AUTH=true` in `.env` bypasses route auth guards (already set by default in dev).

---

## Authentication Flow

1. User calls `POST /api/identity/login` with email + password
2. Backend returns `{ accessToken, refreshToken, tokenType, expiresIn }`
3. Frontend stores tokens in Pinia (`useAuthStore`) + `localStorage`
4. Kiota's `BearerAuthenticationProvider` reads token from store and adds `Authorization` header to every request
5. Backend validates JWT on protected endpoints via `[Authorize]` attribute

---

## Important Files Quick Reference

| File | Purpose |
|------|---------|
| `src/Tidansu.API/Program.cs` | App startup and DI registration |
| `src/Tidansu.API/Middlewares/ErrorHandlingMiddleware.cs` | Exception → HTTP mapping |
| `src/Tidansu.API/Models/ApiOperationResult.cs` | Standard response wrapper |
| `src/Tidansu.Infrastructure/Persistence/TidansuDbContext.cs` | EF Core context |
| `src/Tidansu.Application/Extensions/ServiceCollectionExtensions.cs` | Application DI |
| `src/Tidansu.App/src/router/index.ts` | Route definitions |
| `src/Tidansu.App/src/stores/useAuthStore.ts` | Auth token management |
| `src/Tidansu.App/src/composables/useApiClient.ts` | API client singleton |
| `src/Tidansu.App/src/style.css` | Theme tokens + global styles |
