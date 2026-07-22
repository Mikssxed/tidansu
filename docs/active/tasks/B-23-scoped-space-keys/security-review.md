# Tidansu — Security Review (B-23)
**Date:** 2026-07-22
**Scope:** Working diff, B-23 only — server-assigned CSPRNG `Space.Id`, per-account rate limit on `POST /api/spaces`, `UseRateLimiter` move, store temp→server id reconciliation.
**Type:** Findings report only — no code changes made.

**Overall:** The headline fix is sound and closes the cross-tenant DoS + existence oracle at the tenancy root. `Space.Id` is now minted server-side from a 128-bit CSPRNG and the client value is never persisted anywhere in the create path (verified: the only `SpaceDto.ToEntity` reached by create is the two-arg, server-id overload). The rate limiter is correctly repositioned so per-account partitioning actually works, and the pre-existing IP-keyed limiters still fire. No exploitable issue remains in the data path. Two Low items: a dead client-id-trusting overload left behind as a latent trap, and a cross-feature parity interaction (B-23 random ids vs. B-24/B-17 position-based over-cap badging) that is a UX/correctness regression, not a security bypass.

## What's already done right
- **`Space.Id` server-assigned, client value never trusted.** `CreateSpaceCommandHandler:53,59` generates `spaceId` via `ISpaceIdGenerator` and calls `dto.ToEntity(userId, spaceId)`, which stamps the server id onto the space *and* every child zone/item (`SpaceDto.cs:48-60`). Grep of all `.ToEntity(` callers confirms the create path never reaches the client-id `ToEntity(userId)` overload; `dto.Id` is only otherwise used for the owner-scoped item duplicate-id pre-check (B-22 territory), never persisted from the client on Space.
- **CSPRNG is sound and collision-safe.** `SpaceIdGenerator.cs:20` uses `RandomNumberGenerator.GetBytes(16)` = 128 bits (not `Guid.NewGuid`), base64url-encoded, `space_`-prefixed → 28 chars, under the `nvarchar(64)` column. Birthday bound ≈ 2^64; a bounded regenerate-and-retry backs it up, and the `DbUpdateException` middleware clause (`ErrorHandlingMiddleware.cs:184-210`) renders any residual as a byte-identical generic 500 that leaks nothing (id was server-chosen).
- **Gate ordering preserved.** Id generation runs *after* `PlanPolicy.CheckNewSpace` (403 `{plan:[…]}`) and *after* `SpacePhotoGuard.ThrowIfInvalid` (`CreateSpaceCommandHandler:39,46,53`) — a Free user at cap or sending a photo still gets the correct 403/400, no new code path.
- **Rate limiter now genuinely per-account.** `SpaceCreateRateLimitPolicy` partitions on `ClaimTypes.NameIdentifier` (`WebApplicationBuilderExtensions.cs:169-178`), and `UseRateLimiter()` is moved to after `UseAuthentication`/`UseAuthorization` (`Program.cs:129-140`), so `httpContext.User` is populated when the partition key is read — it no longer silently degrades to the per-IP fallback. Placement after `UseAuthorization` also means an unauthenticated caller is 401'd before consuming any budget.
- **Pre-existing IP-keyed limiters unaffected by the move.** `auth` (10/min), `magic-link` (3/min) and `billing-webhook` (constant key) all key on `RemoteIpAddress`/a constant set by `UseForwardedHeaders` (`Program.cs:97`), which runs far earlier and is independent of auth — the move does not disturb them.
- **No existence oracle on create.** The client can neither choose nor probe an id; the 200-vs-500 split is gone; the plan-limit 403 reflects only the caller's own space count.

## Security findings

### Critical
None.

### High
None.

### Medium
None.

### Low / Hardening
**S-L1 — Dead `SpaceDto.ToEntity(string userId)` overload still trusts client `Id`.**
`src/Tidansu.Application/Spaces/Dtos/SpaceDto.cs:30-42`. The single-arg overload sets `Id = Id` (client value) and stamps children with the client `Id`. A full grep of `.ToEntity(` shows it has **zero callers** — the create path uses the two-arg server-id overload. It is therefore not exploitable today, but it is exactly the trap B-23 exists to close, left loaded: a future create/persist caller could pick it up and silently reintroduce the client-supplied-id gap. **Fix:** delete the single-arg overload (nothing calls it), or if kept for symmetry, rename/annotate it so it can never be used on a persist path (e.g. `ToEntityUnsafeClientId`), and add a one-line guard test asserting the create handler uses the server-id overload.

**S-L2 — B-23 random ids break the SPA's position-based over-cap parity assumption (no security bypass; hand to branch-code-reviewer).**
Root cause lives in B-23; the *symptom* is in B-24/B-17. The SPA badges over-cap spaces by slicing `spaces.value` **as-is** (`useLimits.ts:50-54`), relying on store order mirroring the server's `OrderBy(s => s.Id)`. Optimistic create appends to `spaces.value` and `reconcileSpaceId` (`useSpacesStore.ts:479-516`) rewrites `space.id` in place **without re-sorting**. Pre-B-23 client ids were counter-derived and roughly monotonic, so append order ≈ sorted order; B-23's fully-random server ids make append order and `OrderBy(Id)` uncorrelated until the next full `GetSpaces` hydrate. **Security impact: none** — B-24's server gate recomputes rank in SQL every request and independently freezes exactly `total - cap` spaces, so a Free user can never write to more than `cap` spaces regardless of SPA ordering (see B-24 review). The consequence is a transient UX mismatch (a space the SPA shows editable may return a surprise 403, or vice-versa). Recorded here because the team's ordering-parity mitigation only guaranteed *server-internal* parity and did not account for the client array-order assumption once ids became random. **Fix (correctness, not security):** after `reconcileSpaceId`, keep `spaces.value` sorted by `id` (or re-derive the read-only set from a sorted copy in `useLimits`) so the SPA over-cap set matches the server without waiting for a re-hydrate.

**S-L3 — Collision-retry loop cannot recover on the Free (capped) path (defense-in-depth only; hand to reviewer).**
`CreateSpaceCommandHandler.cs:57-88`. On a `DbUpdateException` in the Free branch, the failed entity remains tracked in the EF change tracker in `Added` state; the retry adds a *second* entity, so the next `SaveChanges` attempts to insert both, and the stale one re-collides — the loop cannot succeed. **Impact: none** — a 128-bit collision is below hardware-fault probability so this path is effectively unreachable, and any residual maps to the leak-free generic 500. Purely a correctness note on defense-in-depth code (S-4 in the tech-tasks); owned by the branch-code-reviewer. **Fix (if kept):** detach the failed entity (or use a fresh scope) before retrying, or drop the retry and rely solely on the middleware backstop the tech-tasks already deem sufficient.

## Verification checklist
- [ ] As a Pro user, `POST /api/spaces` with `id:"space_1zzz"` → response id is a fresh `space_…` server value, not the submitted one; a second account creates freely with its own id (oracle gone).
- [ ] > 20 creates/min from one account → excess 429; a second account in the same window is unaffected (per-account, not per-IP).
- [ ] After the `UseRateLimiter` move: hammer `POST /api/auth/magic-link` (3/min → 429) and a login endpoint (10/min → 429) — confirm the IP limiters still fire.
- [ ] Confirm `grep '\.ToEntity('` shows no persist-path caller of the single-arg `SpaceDto.ToEntity(userId)` (S-L1).
