---
name: confirmed-protections-spaces
description: Spaces/zones/items protections verified by tracing (B-15 audit, 2026-07-16) — don't re-flag these as findings
metadata:
  type: project
---

Verified by tracing during the B-15 audit (2026-07-16). Treat as confirmed unless the
code changes — re-flagging these wastes the developer's time and inflates the report.

**Why:** the Tidansu spaces path is heavily commented with its own security rationale.
The comments are accurate, which makes it tempting to either trust them blindly or
re-derive everything each audit. These are the ones I actually traced to ground.

**How to apply:** when auditing anything under `Tidansu.Application/Spaces/`,
`SpacesRepository.cs`, or the space controllers, start from this list and only spend
effort on what changed.

- **Ownership is structural, not per-endpoint.** `ISpacesRepository` has no method that
  resolves a zone/item by bare id — every one takes `(spaceId, entityId, userId)` and roots
  at `dbContext.Spaces.Where(s => s.Id == spaceId && s.UserId == userId)`. An unscoped
  mutation is not expressible. Two *safe* documented exceptions reach entities directly:
  `RemoveZoneWithItemsAsync` (its `zone.SpaceId` is owner-resolved first) and the set-based
  `RemoveItemAsync` (ownership lives in an EXISTS subquery inside the DELETE's WHERE).
- **Plan comes from the DB, never the JWT.** Handlers use `userService.FindByIdAsync`;
  `CurrentUser` carries no `Plan` claim. Stale-token plan escalation is not possible.
- **No `ForbidException` anywhere under `Spaces/`.** Unknown and cross-user ids share one
  null/false → 404 branch. 404/403 non-divergence holds by construction.
- **The `sp_getapplock` fail-closed property holds** in all copies: RETURN code captured via
  `ToListAsync().Single()`, `< 0` → `InvalidOperationException` → 500, never a
  `PlanLimitException`. Handlers 404 on an owner-scoped count *before* the repo call, so a
  cross-user id cannot reach the lock (no lock-contention DoS).
- **Photo trust boundary: plan gate strictly before `SpacePhotoGuard`** in every item
  handler, and the DTO validators carry explicit "do not add a photo rule here" comments
  (a FluentValidation rule would preempt the 403 with a 400).
- **No photo is ever logged or interpolated.** `SpacePhotoGuard` takes a *static* error key
  (`"Item.Photo"`), never the blob. `PhotoPolicy.Check` is span-based, no regex (no ReDoS),
  bounded header scan, arithmetic size check before decode, magic-byte sniff vs declared type.
- **Cap enforcement:** adds gate on `currentCount >= cap` and re-decide authoritatively
  under the lock. Updates/deletes get **no gate call at all** — that absence is the
  intended post-downgrade rule (D-1), NOT a missing check. Do not report it as one.

Added after the **B-22 audit (2026-07-21)** — composite `(SpaceId, Id)` keys on Zone/Item:

- **`Zone`/`Item` are reached in exactly ONE file.** A repo-wide grep for `Set<Item>`/
  `Set<Zone>`/`.Zones`/`.Items`/`FindAsync`/`Entry(` hits only `SpacesRepository.cs` plus
  the `TidansuDbContext` mapping. No controller/handler/service touches them directly, so
  the tenant-isolation surface is one file. Re-run that grep on any diff adding an entity
  access path; if it grows past one file, the structural argument is gone.
- **The composite key made owner-scoping load-bearing, and every query survived it.** All
  child queries root at `Spaces.Where(s => s.Id == spaceId && s.UserId == userId)` and
  reach through `s.Zones`/`s.Items` (EF joins on SpaceId), so the trailing `z.Id == zoneId`
  is a filter *within* an owner-restricted set. `RemoveItemAsync` now also states
  `i.SpaceId == spaceId` inline. `RemoveZoneWithItemsAsync` remains the sole documented
  exception and is safe (its `zone` is owner-resolved first).
- **No key column is client-mutable.** `UpdateZone`/`UpdateItemCommandHandler` assign only
  non-key fields — never `Id` or `SpaceId`. Moving a row across tenants isn't expressible.
- **Both 500 branches in `ErrorHandlingMiddleware` are byte-identical.** The
  `DbUpdateException` clause and the catch-all produce the same status, content-type and
  `{"errors":{"general":["Something went wrong."]},"isSuccess":false}`. `ApiOperationResult`
  has only `Errors` + `IsSuccess` — **no traceId/timestamp**, so nothing per-request can
  differ. Don't re-derive this; just check the shape hasn't grown a field.
- **Every `NotFoundException` under `Spaces/` reflects only the caller's own request input**
  (route segment or `dto.ZoneId`), never a DB-read value. Safe self-reflection.
- **The AddZone/AddItem duplicate-id TOCTOU race is benign and verified so:** the composite
  key is a real backstop (fail-closed), both racers are the same user on their own space,
  and the failed `SaveChangesAsync` rolls back via `await using` — since the applock is
  `@LockOwner='Transaction'` it is released, so **no lock is stranded** and it can't be
  escalated into lock-exhaustion. That last point is the one that makes it benign.

See [[recurring-gaps-tidansu]] for what does still go wrong here.
