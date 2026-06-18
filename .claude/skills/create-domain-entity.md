# Skill: Create Domain Entity

Use this to add a new entity to `Tidansu.Domain/Entities/`.

---

## Rules

- Domain entities must have **zero dependencies** on Application, Infrastructure, or API
- No EF Core attributes in the entity — use Fluent API in `TidansuDbContext`
- No service calls — entities are plain data containers with optional domain logic methods
- All entities use `Guid Id` as primary key (set by the database or EF Core)

---

## Entity Template

```csharp
namespace Tidansu.Domain.Entities;

public class {EntityName}
{
    public Guid Id { get; set; }

    // Required string properties — initialize to empty to avoid nullable warnings
    public string Name { get; set; } = string.Empty;

    // Timestamps
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime UpdatedAt { get; set; } = DateTime.Now;

    // Enum property (from Domain/Constants/)
    public {EnumType} Status { get; set; }

    // User relationship (if user-owned)
    public string UserId { get; set; } = string.Empty;
    public User User { get; set; } = default!;

    // Optional navigation properties
    public ICollection<{RelatedEntity}> Items { get; set; } = new Collection<{RelatedEntity}>();
}
```

---

## Repository Interface (Domain layer)

```csharp
// Tidansu.Domain/Interfaces/Repositories/I{EntityName}Repository.cs
namespace Tidansu.Domain.Interfaces.Repositories;

public interface I{EntityName}Repository
{
    Task<Guid> Create({EntityName} entity);
    Task<{EntityName}?> GetById(Guid id, string userId);
    Task<IEnumerable<{EntityName}>> GetAll(string userId);
    Task Update({EntityName} entity);
    Task Delete(Guid id);
}
```

Only define methods that will actually be used.

---

## EF Core Configuration (Infrastructure)

Add a `DbSet` in `TidansuDbContext`:
```csharp
public DbSet<{EntityName}> {EntityNames} { get; set; }
```

Configure relationships in `OnModelCreating()` using Fluent API:
```csharp
modelBuilder.Entity<{EntityName}>(entity =>
{
    entity.HasOne(e => e.User)
        .WithMany(u => u.{EntityNames})
        .HasForeignKey(e => e.UserId);

    entity.HasMany(e => e.Items)
        .WithOne(i => i.{EntityName})
        .HasForeignKey(i => i.{EntityName}Id)
        .OnDelete(DeleteBehavior.Cascade);
});
```

---

## Enums (Constants)

If the entity needs new enums, add them in `Tidansu.Domain/Constants/`:

```csharp
// Tidansu.Domain/Constants/{EnumName}.cs
namespace Tidansu.Domain.Constants;

public enum {EnumName}
{
    Value1,
    Value2,
    Value3
}
```

---

## After Creating the Entity

1. Add repository interface to Domain
2. Implement repository in Infrastructure
3. Register repository in `ServiceCollectionExtensions.cs`
4. Add `DbSet` to `TidansuDbContext`
5. Configure relationships in `OnModelCreating`
6. Add EF Core migration:
```bash
dotnet ef migrations add Add{EntityName} \
    --project src/Tidansu.Infrastructure \
    --startup-project src/Tidansu.API
```
