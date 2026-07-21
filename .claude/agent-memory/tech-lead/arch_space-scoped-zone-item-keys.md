---
name: space-scoped-zone-item-keys
description: B-22 composite (SpaceId, Id) keys on Zone/Item — why the migration is safe, and the bare-id query hazard the change introduces
metadata:
  type: project
---

Zone/Item primary keys moved from `(Id)` to composite `(SpaceId, Id)` (B-22, planned
2026-07-21) to stop client-supplied clock-derived ids colliding across tenants.

**Why:** globally-unique client-supplied ids let one account squat the ~46,656-value `uid()`
space, breaking other users' first zone-add with a 500 and creating a cross-tenant existence
oracle (200-vs-500). Pre-existing; surfaced by the B-15 security review but not caused by it.

**How to apply — the three non-obvious facts, each verified against the code:**

1. **There is no `Item` → `Zone` FK, and there must not be one.** `Item.ZoneId` is a bare
   `nvarchar(64)`; the referential rule lives in `AddItemCommandHandler` via
   `ZoneExistsInSpaceAsync`. Every plan that assumes an FK re-point exists is wrong. Adding
   one would turn a dangling `ZoneId` into a 500 — the failure class B-22 exists to remove.

2. **A `(Id)` → `(SpaceId, Id)` key widening can never fail on existing data.** `(Id)` unique
   table-wide implies `(SpaceId, Id)` unique. Zero rows change; it is a key-definition
   migration, not a data migration. Do not plan row-copy/verify/resume machinery. EF's default
   per-migration transaction gives all-or-nothing for free — `suppressTransaction: true` is
   the only call that breaks it.

3. **The real new hazard is that bare-id queries stop being accidentally safe.** While ids were
   globally unique, `WHERE Id = @id` could only ever hit one row, so an under-scoped query was
   harmless. Afterwards it can hit N tenants. `SpacesRepository.RemoveItemAsync` is the
   tripwire: its space correlation is indirect (`s.Id == i.SpaceId` inside an EXISTS) rather
   than a direct `i.SpaceId == spaceId`. Treat any future bare-id lookup on Zone/Item as a
   🔴 cross-tenant finding.

**Related:** the residual 500 after the key fix is a duplicate id *within the caller's own
space* (no in-space pre-check in `AddZone`/`AddItem`; `SpaceDto.ToEntity` builds the whole
graph so a duplicate in one `POST /api/spaces` throws an EF change-tracker
`InvalidOperationException`, not a `DbUpdateException`). See
[[validation-preempts-plan-gate-403]] — the FR-5 collection cap (500 zones / 5,000 items) is a
validator rule and so returns 400 before any paywall 403.
