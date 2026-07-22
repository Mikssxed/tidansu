---
name: arch-root-entity-id-cannot-be-composite-keyed
description: B-22's (SpaceId,Id) composite-key fix does NOT transfer to Space (the tenancy root / FK principal); server-assign the id instead. Plus the UseRateLimiter-before-auth trap.
metadata:
  type: project
---

When a client-supplied, globally-unique primary key causes cross-tenant collision
(DoS + existence oracle), the fix depends on whether the entity is a **child** or the
**tenancy root**.

- **Child entity (Zone/Item, B-22):** narrow the PK to a composite `(ParentId, Id)`.
  Works because the child already carries a parent id to lead with, and the migration
  can't fail on existing data (`Id` was unique table-wide ⇒ `(ParentId, Id)` unique a
  fortiori).
- **Root entity (Space, B-23):** composite `(UserId, Id)` **does not work** because
  `Space` is the **FK principal** for `Zone`/`Item` (`FK_*_Spaces_SpaceId → Spaces.Id`).
  A SQL Server FK needs the referenced column uniquely constrained, so re-keying `Space`
  either (b1) keeps a UNIQUE index on `Id` — re-imposing the exact global uniqueness
  you're killing — or (b2) forces adding a `UserId` column to both `Zone` and `Item` and
  rewiring their composite FKs (invasive data migration). **Resolution: server-assign the
  root id from a CSPRNG** (`ISpaceIdGenerator` in Domain, `RandomNumberGenerator` impl in
  Infrastructure, registered in `ServiceCollectionExtensions`). `Space.Id` stays the sole
  PK, `nvarchar(64)`, a valid FK principal. **No schema change ⇒ no EF migration; no DTO
  change ⇒ no Kiota regen.** The handler ignores `dto.Id` and stamps the generated id onto
  the space + its child graph via a `SpaceDto.ToEntity(userId, spaceId)` overload.

**Why:** B-23 (the S-H1 follow-up filed by B-22's security review). The brief explicitly
warned B-22's composite answer would not transfer; the FK-principal constraint is the
concrete reason.

**How to apply:** For any "client-supplied global PK collision" finding, first ask whether
the entity is an FK principal. If yes, prefer server-assignment over composite keys.

**Two traps that came with it:**
1. **FR-6 optimistic-add cost.** The spaces store (`useSpacesStore.createRemote`) discards
   the create response and treats the client's `uid('space')` as the authoritative route
   key. Server-assignment forces the store to adopt the returned id: reconcile temp→server
   id across `spaces.value`/`contentsLoaded`/`changeSets`/`saveTimers`/`inFlight`, and gate
   the space's autosave until create resolves (else a granular edit flushes against the temp
   id → 404, the store's documented BUG-2/3 class). Keep the optimistic push synchronous so
   "appears immediately" is unchanged.
2. **`UseRateLimiter` runs before `UseAuthentication` (`Program.cs`).** So a per-account
   rate-limit partition keyed on `ClaimTypes.NameIdentifier` sees an empty `httpContext.User`
   and silently degrades to the IP fallback. Move `UseRateLimiter` after
   `UseAuthentication`/`UseAuthorization` for any per-account limiter; the existing IP-keyed
   auth/magic-link/webhook limiters are unaffected by the move (they key on IP/a constant).

Related: [[arch_plan-cap-check-then-insert-race]], [[arch_space-scoped-zone-item-keys]].
