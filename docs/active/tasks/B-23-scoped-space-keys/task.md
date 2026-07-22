---
id: B-23
slug: scoped-space-keys
title: Space.Id globally unique + client-supplied → cross-tenant DoS (one level up from B-22)
status: in-review          # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: []
touch-points:
  - src/Tidansu.Infrastructure/Persistence/TidansuDbContext.cs
  - src/Tidansu.Infrastructure/Persistence/Migrations (new migration)
  - src/Tidansu.Application/Spaces/Dtos/SpaceDto.cs
  - src/Tidansu.Application/.../CreateSpaceCommandHandler.cs
  - src/Tidansu.App/src/data/spaces.ts
---

# B-23 · Space.Id globally unique + client-supplied → cross-tenant DoS

## Description
`Space` is the tenancy root, yet `modelBuilder.Entity<Space>` has no `HasKey`, so
EF convention makes `Id` alone the primary key — one space id is unique across
every tenant. `SpaceDto.ToEntity` takes `Id` from the client verbatim, and the
client generates it with a low-entropy clock-derived `uid('space')` (only ~46,656
reachable suffixes, cycling ~47s). Because Pro has unlimited spaces and
`POST /api/spaces` has no rate limiter, a Pro account can squat the space-id range
and force every other user's *first* space creation to a 500 — the exact
cross-tenant DoS + existence oracle that B-22 killed for Zone/Item, but on the
parent entity, which B-22 never touched.

## Acceptance criteria
- [ ] Two different tenants can hold spaces with the same `Id` value without a
      PK/collision error (or space ids are no longer collidable across tenants at all).
- [ ] A client-supplied (or replayed) space id can no longer make another tenant's
      space creation fail — no 500, no 200-vs-500 existence oracle.
- [ ] A rejected/collided space-creation attempt returns a clear, expected client
      response — never the app's generic unexpected-error message.
- [ ] `POST /api/spaces` is rate-limited per account, independent of the
      identifier fix (unlimited unmetered creation is what makes the DoS cheap).
- [ ] Existing spaces (Free, at-cap, over-cap read-only after downgrade, Pro with
      photos) continue to load and mutate exactly as before; the migration
      applies cleanly with no data loss or reassignment.
- [ ] No regression to the optimistic-add "space appears immediately" create
      experience B-22 deliberately protected for Zone/Item.
- [ ] Any repo comments claiming tenant isolation is structural/complete
      repo-wide are corrected to note the `Space` gap this task closes.

## Notes
- **This is NOT the same fix as B-22.** B-22 used a composite `(SpaceId, Id)` key
  on Zone/Item. `Space` has no parent id to scope against, so there is **no
  composite-key option**. The real choice (decide at the tech-planning gate) is
  between a **server-assigned id / CSPRNG** and **`(UserId, Id)` as the key** —
  both need an EF migration and a decision about the client contract; the second
  changes the optimistic-add path.
- **Trap:** B-22 left confident comments in `SpacesRepository.cs` and
  `TidansuDbContext.cs` about scoping being "structural"/tenant isolation being
  "load-bearing". Those are true for Zone/Item ONLY (flagged 🟡 S-L2). Do not read
  them as covering `Space`; update the misleading ones.
- Source: B-22 security review § S-H1 —
  `docs/active/tasks/B-22-scoped-zone-item-keys/security-review.md`.
- Full pipeline (sensitive tenancy/ownership surface + schema migration + client
  contract). Independent of B-24 for requirements/tech-planning; watch for
  implementation overlap on `SpaceDto`/space mutate paths.
- **RESOLVED at tech-planning (see `tech-tasks.md` § 0):** identifier strategy =
  **server-assigned CSPRNG `Space.Id`**, NOT `(UserId, Id)`. Decisive reason:
  `Space` is the FK *principal* for `Zone`/`Item` (`FK_*_Spaces_SpaceId` →
  `Spaces.Id`), so re-keying to `(UserId, Id)` either keeps a UNIQUE index on `Id`
  (re-imposes the exact global uniqueness we're killing) or forces adding a `UserId`
  column to both `Zone`/`Item` and rewiring their FKs (invasive data migration on
  the tables B-22 just reworked, against FR-5). Server-assignment needs **no schema
  change, no EF migration, no Kiota regen**, and closes the DoS + oracle at the
  source. Cost: FR-6 — the store must adopt the returned id (reconcile temp→server
  id + gate autosave until create resolves); planned explicitly, with the flush race
  called out.
- **Rate limit:** per-account fixed window, 20 creates/min, keyed by
  `ClaimTypes.NameIdentifier`. **Trap:** `app.UseRateLimiter()` currently runs
  *before* `UseAuthentication` (`Program.cs:129`), so per-account partitioning needs
  it moved after auth — otherwise it silently degrades to per-IP.
- **Existing rows:** no retroactive fix — old client-supplied ids are already
  globally unique and coexist with new server ids in the same column.
- **Open question carried to tech-planning (see `requirements.md`):** the
  identifier strategy — server-assigned/CSPRNG id vs. `(UserId, Id)` composite
  key — is deliberately left unresolved by requirements; both satisfy every
  functional requirement, but they differ in effect on the optimistic "space
  appears immediately" create flow (server-assigned id may require the app to
  wait for the server's response). Tech-lead/human to decide.
- Also open: the concrete rate-limit window/threshold for `POST /api/spaces`,
  and whether any pre-existing colliding identifiers need a retroactive fix.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
