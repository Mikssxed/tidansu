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

See [[recurring-gaps-tidansu]] for what does still go wrong here.
