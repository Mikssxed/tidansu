---
name: ef-nested-entity-projection-omits-column
description: EF Core (this repo, EF Core on .NET 10 / SQL Server) translates a Select projecting into new Entity { Collection = child.Select(c => new Child {...}).ToList() } fine, including omitting one field entirely — useful to drop a heavy column (e.g. a photo blob) from a read without a separate read-model type.
metadata:
  type: project
---

When a read needs an entity graph but must omit one heavy column (e.g. `Item.Photo`,
an `nvarchar(max)` data-URL — see B-16 / SC-3), you can project straight into the
entity types themselves rather than inventing a parallel read-model:

```csharp
dbContext.Spaces
    .Where(s => s.Id == id && s.UserId == userId)
    .Select(s => new Space
    {
        Id = s.Id, /* …scalars… */
        Zones = s.Zones.OrderBy(z => z.Position).Select(z => new Zone { /* …every field… */ }).ToList(),
        Items = s.Items.Select(i => new Item { Id = i.Id, /* every field EXCEPT Photo */ }).ToList(),
    })
    .AsNoTracking()
    .FirstOrDefaultAsync(...);
```

EF Core translates this cleanly — nested `.Select(child => new Child {...}).ToList()`
inside an outer entity-projection is supported, and a field left out of the inner
`new Child {...}` (here `Photo`) is simply never referenced in the generated SQL
`SELECT`, so it never leaves the database. No "non-composable" or translation error.

**Why this matters**: a tech-plan may hedge with "if EF rejects the
entity-projection, fall back to a `SpaceLayout`-style Domain read-model record" —
that fallback was not needed here. Try the entity-projection first; it's simpler
(reuses `SpaceDto.FromEntity` unchanged, since the shape returned is still the real
entity type) and works for at least this repo's EF Core version.

**Caveat**: the returned entity is a *projection*, not a tracked load — required
non-nullable navigation properties you don't set (e.g. `Space.User`) stay at their
default (`null!`), which is fine as long as nothing downstream reads them. Always
pair this with `.AsNoTracking()`; it's a read path, never a mutate path.

See [[domain-interface-extension-needs-infra-stub]] for the sibling gotcha about
repository interface changes needing every implementer updated in the same diff.
