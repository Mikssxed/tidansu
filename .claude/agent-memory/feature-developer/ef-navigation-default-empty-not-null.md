---
name: ef-navigation-default-empty-not-null
description: EF Core entities with `= []`-initialized navigation collections stay empty (not null, no NPE) when loaded without .Include — a DTO built from such a partial load silently looks "correct but empty" instead of failing loudly.
metadata:
  type: feedback
---

When a Tidansu entity declares a navigation collection with a default initializer
(e.g. `Space.Zones`/`Space.Items` as `List<Zone> Zones { get; set; } = [];`), and the
entity is loaded via an EF query that does **not** `.Include` that navigation (no
lazy-loading proxies are configured anywhere in this repo), the property is simply
left at its CLR default — an empty list — not `null`. Nothing throws.

**Why this matters:** a shared `FromEntity`-style mapper (e.g. `SpaceDto.FromEntity`,
which reads `s.Zones`/`s.Items`) will happily build a DTO from a partially-loaded
entity and produce misleading empty collections, not an exception. There is no
signal that the data wasn't loaded — the output looks like "this space has no
zones/items" rather than "zones/items were never fetched".

**How to apply:** when adding a lightweight repository method that deliberately
skips `.Include` for cost reasons (e.g. `GetByIdWithoutContentAsync`, added in B-15
FR-7 to avoid pulling every item's photo just to rename a space), do not reuse a DTO
mapper that reads the un-included navigations. Either return a narrower DTO scoped to
what was actually loaded (what we did: added `SpaceFieldsDto.FromEntity`, distinct
from `SpaceDto.FromEntity`), or make the omission explicit some other way. Treat
"the mapper compiles and returns something" as no evidence the collections are
meaningful — check what was actually `.Include`d before trusting a `FromEntity`
call on a narrowly-loaded entity.
