# Tidansu — Security Review (B-24)
**Date:** 2026-07-22
**Scope:** Working diff, B-24 only — `SpaceOverCapGuard`, `PlanPolicy.CheckSpaceContentMutation`, `CountSpacesOrderedBeforeAsync` rank query, and the 7 gated mutate handlers.
**Type:** Findings report only — no code changes made.

**Overall:** This closes the real access-control gap: a downgraded Free user with a valid JWT can no longer mutate over-cap content by calling the API directly. All 7 gated handlers place the guard **after** their owner-scoped 404 and **before** any mutation, the guard fails closed, and the rank query is collation-matched to the server's own `OrderBy(Id)`. I could not construct a plan-limit bypass, a cross-tenant existence oracle, or a downgrade race that leaves a persistent write window — the server recomputes the over-cap set live on every request. No exploitable issue found. The one adjacent concern (SPA/server over-cap set can transiently diverge) is a UX/correctness parity regression caused by B-23's random ids, not a security bypass; it is documented as S-L1 here and in B-23's review.

## What's already done right
- **404-before-403 on every gated handler (no cross-tenant over-cap oracle).** Verified in all seven:
  - `UpdateSpaceFields:24-31` — `GetByIdWithoutContentAsync ?? 404` → guard.
  - `AddZone:27-34` — `CountZonesAsync ?? 404` → guard → `CheckAddZone`.
  - `AddItem:29-41` — space `CountItemsAsync ?? 404`, referenced-zone `ZoneExistsInSpaceAsync ?? 404` → guard → `CheckAddItem`.
  - `UpdateZone:22-28` — `GetZoneAsync ?? 404` → guard.
  - `UpdateItem:27-45` — `GetItemAsync ?? 404`, zone-reassign `ZoneExistsInSpaceAsync ?? 404` → guard → photo gate.
  - `RemoveZone:24-30` / `RemoveItem:24-29` — **new explicit owner-scoped `*ExistsInSpaceAsync ?? 404` pre-check** *before* the guard, so the removal path (whose 404 used to be decided inside the repo delete) can no longer turn a would-be 404 into an over-cap 403. Every 404 pre-check is `WHERE s.UserId == userId`-scoped, so a non-owned id yields 404 and the guard never runs against another tenant's space.
- **Guard fails closed.** `SpaceOverCapGuard.cs:32-43`: throws `AuthenticationException` if the user is gone, Pro short-circuits only when `PlanCaps.For(plan).Spaces is not int` (i.e. genuinely unlimited), otherwise runs the rank query and throws `PlanLimitException("spaces")` on `preceding >= cap`. No swallow, no default-allow; a thrown/failed rank query propagates to a 500, never a silent pass.
- **Rank query is collation-matched to the SPA's server-provided order.** `SpacesRepository.cs:34-37` uses `string.Compare(s.Id, spaceId) < 0`, which EF translates to a relational `WHERE [Id] < @spaceId` under the column's own collation — the *same* collation `GetSpaceSummariesPageAsync`'s `OrderBy(s => s.Id)` (line 61) uses. Both are SQL-side, so the server gates exactly the account's last `total - cap` spaces by sorted `Id`; there is no in-memory ordinal compare that could pick a different set. `Id` is the PK (unique), so there are no ties/off-by-one at the cap boundary. `preceding >= cap` matches the SPA's `slice(cap)` (positions `0..cap-1` writable).
- **DeleteSpace correctly left ungated.** Not in the diff; `DeleteSpaceCommandHandler` is untouched, preserving the recovery path back under the cap.
- **Live, uncached evaluation — no downgrade-race write window.** The guard loads `user.Plan` fresh each request (`SpaceOverCapGuard.cs:34`) and recomputes rank each request. A Pro→Free downgrade takes effect on the very next mutation; deleting an over-cap space makes the next-ranked space writable on the next request with no unlock step. There is no snapshot to abuse.
- **Reason precedence is safe.** The guard runs before `CheckAddZone`/`CheckAddItem`/the photo gate, so an over-cap space reports `{plan:['spaces']}` — accurate and non-leaking; `PlanLimitException` maps to 403 with only the reason string (`ErrorHandlingMiddleware.cs:51-68`).

## Security findings

### Critical
None.

### High
None.

### Medium
None.

### Low / Hardening
**S-L1 — SPA and server can transiently disagree on *which* spaces are over-cap (no bypass; parity/UX, hand to branch-code-reviewer).**
The server freezes the account's last `total - cap` spaces by SQL `OrderBy(Id)` (correct and authoritative). The SPA badges read-only by slicing `spaces.value` **as-is** (`useLimits.ts:50-54`), assuming store order mirrors `OrderBy(Id)`. With B-23, newly created spaces are appended optimistically and `reconcileSpaceId` (`useSpacesStore.ts:479-516`) rewrites `space.id` to a **random** server id **without re-sorting**, so store order and `OrderBy(Id)` diverge until the next full `GetSpaces` hydrate. **Security impact: none** — B-24 enforces the cap independently server-side on every request, so the *count* of writable spaces is always exactly `cap`; the identity of which spaces are writable can differ from the badges transiently, producing at worst a surprise 403 (which FR-6/Open-Q2 says the existing paywall/B-19 toast should absorb) or a space the SPA over-restricts. No plan-limit bypass, no monetary impact. **Fix (correctness, not security):** keep `spaces.value` sorted by `id` after reconcile, or derive `readonlySpaceIds` from a sorted copy, so the badged set matches the server without a re-hydrate. Tracked jointly with B-23 S-L2.

**S-L2 — Double user PK lookup on `AddZone`/`AddItem`/`UpdateItem` (accepted; noted for completeness).**
Those three handlers load `user` for their own photo/count gates and the guard loads it again (`SpaceOverCapGuard.cs:34`). Deliberately accepted in the tech-tasks to keep every call site identical; no security impact (both reads are owner/PK-scoped). Left as-is unless profiling flags it.

## Verification checklist
- [ ] Free user with 5 spaces created in order (cap=2): the six ops (update fields, add/update/remove zone, add/update/remove item) against S3/S4/S5 each return `403 {"errors":{"plan":["spaces"]}}` and change no data; the same ops against S1/S2 succeed.
- [ ] Call every gated endpoint with a space id the user does **not** own → `404`, never `403` (confirm no over-cap oracle, especially on RemoveZone/RemoveItem).
- [ ] `DELETE` an over-cap space succeeds; the next-ranked space becomes writable on the very next request (no unlock step).
- [ ] Pro user (or upgrade mid-test): all six ops on every space succeed; confirm the EF SQL log shows the rank `COUNT(*)` is **not** run for Pro (short-circuit).
- [ ] Inspect the dev EF SQL log: rank query materialises as `SELECT COUNT(*) FROM Spaces WHERE UserId = @u AND Id < @s` (SQL-side, collation-matched), not a load-then-count.
- [ ] Confirm the SPA's badged read-only set matches the server's blocked set after creating several spaces in one session *without reloading* (this is where S-L1 shows).
