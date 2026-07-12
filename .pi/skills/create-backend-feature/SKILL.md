---
name: create-backend-feature
description: Add a complete backend feature (domain entity, CQRS command/query, handler, validation, repository, and API endpoint) for Tidansu.
---

# Skill: Create Backend Feature

Use this skill to add a complete backend feature: domain entity (if needed), CQRS command or query, handler, validation, repository, and API endpoint.

---

## Step 1 — Clarify Requirements

Before writing any code, confirm:
- What is the feature name? (used for namespaces and file names)
- Does it require a new domain entity, or does it use an existing one?
- Is this a Command (writes data) or Query (reads data)?
- What data does the request take? What does it return?
- Does it require authorization?

---

## Step 2 — Domain Entity (if new entity needed)

Create the entity in `Tidansu.Domain/Entities/{EntityName}.cs`.

Follow the pattern in [create-domain-entity.md](create-domain-entity.md).

If the entity needs a repository, create the interface in `Tidansu.Domain/Interfaces/Repositories/I{Entity}Repository.cs`.

---

## Step 3 — CQRS Command or Query

For write operations, follow [create-cqrs-command.md](create-cqrs-command.md).
For read operations, follow [create-cqrs-query.md](create-cqrs-query.md).

Files go in:
- `Tidansu.Application/{Feature}/Commands/{Name}/` (command)
- `Tidansu.Application/{Feature}/Queries/{Name}/` (query)

---

## Step 4 — AutoMapper Profile (if mapping entity ↔ command/DTO)

Create or update `Tidansu.Application/{Feature}/Dtos/{Feature}Profile.cs`:

```csharp
public class {Feature}Profile : Profile
{
    public {Feature}Profile()
    {
        CreateMap<{Name}Command, {EntityName}>();
        // Add ForMember() overrides for complex mappings
    }
}
```

---

## Step 5 — Repository Implementation (if new repo interface)

Implement the interface in `Tidansu.Infrastructure/Repositories/{Entity}Repository.cs`.

Register it in `Tidansu.Infrastructure/Extensions/ServiceCollectionExtensions.cs`:
```csharp
services.AddScoped<I{Entity}Repository, {Entity}Repository>();
```

---

## Step 6 — API Endpoint

Follow [create-api-endpoint.md](create-api-endpoint.md).

Add the action to the appropriate controller in `Tidansu.API/Controllers/`.

---

## Step 7 — EF Core Migration (if new entity or schema change)

From the repo root:
```bash
dotnet ef migrations add {MigrationName} \
    --project src/Tidansu.Infrastructure \
    --startup-project src/Tidansu.API
```

---

## Step 8 — Regenerate API Client (if endpoint signature changed)

```bash
cd src/Tidansu.App
npm run build:api
```

---

## Checklist

- [ ] Domain entity created (if needed)
- [ ] Repository interface in Domain (if needed)
- [ ] Command/Query created in Application
- [ ] Handler created in Application
- [ ] Validator created in Application
- [ ] AutoMapper profile updated (if needed)
- [ ] Repository implementation in Infrastructure (if needed)
- [ ] Repository registered in Infrastructure DI
- [ ] API endpoint added in API layer
- [ ] EF Core migration added (if schema changed)
- [ ] API client regenerated (if endpoint changed)
