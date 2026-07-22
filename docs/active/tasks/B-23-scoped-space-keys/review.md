# Code Review: B-23 · scoped-space-keys (server-assigned CSPRNG Space.Id + per-account rate limit + store reconcile)

**Date**: 2026-07-22
**Reviewer**: branch-code-reviewer agent
**Diff base**: working tree vs origin/main (uncommitted, shares a branch with B-24)
**Files changed (B-23 slice)**: CreateSpaceCommandHandler, SpaceDto, ISpaceIdGenerator (new), SpaceIdGenerator (new), Infrastructure DI, TidansuDbContext (comment), SpacesRepository (comment), SpacesController, WebApplicationBuilderExtensions, Program.cs, useSpacesStore.ts, data/spaces.ts

> **Scope note.** Trust boundaries, IDOR/existence-oracle ordering, fail-open gates, rate-limit bypass, CSPRNG quality, and secret leakage are owned by the parallel security-reviewer and are **not** covered here. This report is correctness, conventions, scope, dead code, and acceptance-criteria/verification gaps only.

## Summary
The server-side id assignment is clean and correct: the handler generates the id from `ISpaceIdGenerator` after both gates and never trusts `dto.Id`, a `ToEntity(userId, spaceId)` overload re-stamps the child graph, and a bounded regenerate-retry backstops the astronomically-rare collision. The store's temp→server-id reconciliation is thorough — it moves *more* space-keyed state than the tech plan enumerated (matching `discardSpaceLocally`'s cleanup set). The one real concern is the **`router.replace` follow-up the store agent added**: it is correctly *intended* and in-scope, but its implementation almost certainly races SpaceView's "space vanished" watch and bounces the user to the dashboard right after onboarding create — unverified because no browser drive was run.

## 🔴 Critical
None confirmed. See [M1] — it is a lean-Critical that I am holding at Major only because I cannot execute it at runtime.

## 🟠 Major (strongly recommended)

### [M1] `reconcileSpaceId`'s `router.replace(newId)` races SpaceView's "space vanished" watch → likely bounces the user to the dashboard right after onboarding create — **FIXED**
**File**: `src/Tidansu.App/src/stores/useSpacesStore.ts:498-510` (reconcile) ↔ `src/Tidansu.App/src/views/SpaceView.vue:158,185-196`

**Fix applied**: `reconcileSpaceId` is now `async` and reorders its work so the route
lands on `newId` *before* `space.id` itself is mutated. Concretely: every other
space-keyed map/set (`contentsLoaded`/`contentsLoading`/`contentsFailed`/`inFlight`,
the `saveState` scalar entry, `saveTimers`/`changeSets`, `currentId`) is moved to
`newId` first (as before), then, if the current route is `space`/`oldId`, the store
now `await`s `router.replace({ name: 'space', params: { id: newId } })` (wrapped in
try/catch, logged on failure — never left as an unhandled rejection), and only
*after* that resolves does `space.id = newId` get assigned. `createRemote`'s caller
was updated to `void reconcileSpaceId(...)` since the function is now async.

This closes the race: previously `space.id` flipped synchronously, so Vue's
reactive flush for that mutation (a microtask) ran before the router's async
navigation resolved, leaving `props.id` still `oldId` while `getById(oldId)` no
longer matched anything — SpaceView's vanish-watch saw `lastKnownId.value ===
props.id` (both `oldId`) and bounced to the dashboard. Now, by the time
`space.id` changes, `props.id` already reads `newId` (the awaited navigation has
settled), so `getById(props.id)` finds the space on the very next reactive pass.
The intervening moment — route already on `newId`, store still keyed by `oldId` —
also fails the vanish-watch's bounce condition, but for the opposite reason
(`lastKnownId.value` is `oldId`, `props.id` is now `newId`, so they don't match).
Moving the other maps (in particular `contentsLoaded`) before the navigation also
avoids a second latent issue: without that ordering, SpaceView's separate
"fetch contents on `props.id` change" watch would see `newId` not yet marked
loaded and fire a redundant `GET`, which (since the store isn't yet keyed by
`newId` either) would have pushed a duplicate `Space` object.

Verified via `npm run build` (vue-tsc, green) and the existing vitest suite (`npx
vitest run` — 38/38 passing, including the flush-orchestration tests that
exercise `createRemote`'s reject path). No test exercises the *successful*
create → reconcile → route path today (all existing create-path tests use a
rejected `api.create`), so this fix is unit-test-blind by construction; the
task's requested manual browser drive of onboarding-create is still the
authoritative verification for FR-6 and is left to the human/QA pass mentioned
in the Action Checklist below.
**Category**: Correctness / Functional (FR-6)
**Description**: This is the router follow-up the store agent added that was **not** in the tech plan.
- `space = computed(() => store.getById(props.id))` where `props.id` is the route param.
- Onboarding flow (`CreateSpaceView.vue:254-256`): `addSpace(space)` (synchronous push, keyed by the local `uid('space')`), then `router.push({ name:'space', params:{ id: localId } })`. The user is now on `/spaces/{localId}`, and SpaceView's immediate `watch(space)` has set `lastKnownId = localId`.
- Hundreds of ms later the create resolves and `reconcileSpaceId(localId, serverId)` runs. It mutates `space.id = serverId` **synchronously**, which immediately schedules SpaceView's `watch(space)` job into Vue's microtask flush. It then calls `router.replace({ name:'space', params:{ id: serverId } })`, but Vue Router navigation is async — `props.id` only updates to `serverId` after the navigation settles several microtasks later.
- At the intervening flush, `space = getById(props.id === localId)` returns `undefined` (no space carries `localId` anymore), and `lastKnownId.value === props.id` (`localId === localId`) is true, so SpaceView fires `router.replace({ name:'spaces' })` — **bouncing to the dashboard**, racing/superseding the reconcile's own replace.
- The Vue scheduler flush is queued when `space.id` is mutated (before `router.replace` is called), so by microtask ordering it runs *before* the route param updates. The analysis says this fires **deterministically** on the CreateSpaceView flow, not intermittently.

Duplicate-from-dashboard does **not** hit this (`DashboardView.vue:260` stays on the dashboard, so the `current.name === 'space'` guard in reconcile is false). It is specific to create-then-navigate-to-the-new-space (onboarding).

**Why held at Major, not Critical**: the mechanism is fully traced but I have **no browser tool in-agent** to observe it, and the developer's own B-23 "Manual end-to-end drive" checkbox (`tech-tasks.md:298`) is **unchecked** — so this exact flow was never driven by anyone. A 60-second browser drive of onboarding-create resolves it; if it reproduces, **escalate to Critical** (it breaks the primary create flow every time).

**Recommendation**: settle the route param *before* the store mutates `space.id`, so `getById(props.id)` never transiently misses. E.g. `await router.replace({ name:'space', params:{ id: newId } })` (or otherwise land the route on `newId`) **before** `space.id = newId` and the map moves; or make SpaceView's vanish-watch tolerant of an in-flight reconcile (guard on a store `reconcilingSpaces` flag, or accept either old/new id); or key the route/lookup on a stable handle rather than the mutable id. Any of these removes the transient `space === undefined` window.

## 🟡 Minor (nice-to-have)

### [N1] Collision-retry catches all `DbUpdateException`, not just PK/unique collisions
**File**: `src/Tidansu.Application/Spaces/Commands/CreateSpace/CreateSpaceCommandHandler.cs:76-84`
**Category**: Correctness
**Description**: The `catch (DbUpdateException) when (attempt < MaxIdCollisionRetries)` catches *any* persistence fault (FK violation, transient DB error), regenerates the space id, and retries twice, logging each as `"Space id collision ... regenerating"`. It does not *swallow* (the fault propagates after attempt 3 → the existing generic 500), but it retries unrelated faults and logs a misleading cause. The tech plan explicitly warned "do not widen it into a general DbUpdateException catch." Not load-bearing (the plan says the retry may even be dropped), so Minor.
**Recommendation**: narrow to the SQL unique-violation numbers (2601/2627) via `ex.InnerException is SqlException { Number: 2601 or 2627 }`, or add a one-line comment accepting the broad catch as harmless because any residual is a leak-free 500 anyway.

### [N2] Application layer now depends on EF Core's `DbUpdateException`
**File**: `src/Tidansu.Application/Spaces/Commands/CreateSpace/CreateSpaceCommandHandler.cs:2` (`using Microsoft.EntityFrameworkCore;`)
**Category**: Architecture (Clean Architecture)
**Description**: The persistence-exception type now leaks into an Application handler. The map-to-500 already lives in `ErrorHandlingMiddleware` (API layer); this couples Application to EF purely for a defense-in-depth retry. Contained and pragmatic, but it is a mild layer inversion worth noting — Application handlers elsewhere throw/handle Domain exceptions, not EF ones.
**Recommendation**: acceptable as-is; if the team wants to keep Application EF-free, move the retry into an Infrastructure repository method (`AddWithRetryAsync`) that owns the `DbUpdateException`.

## 🧭 Convention Violations (project rules)
- None. No Vue template changed (only the store + a data helper), so template-purity / variant-styling / hex rules are N/A. `src/api/apiClient/` untouched (no Kiota regen — correct, no contract change). No EF migration added (correct — no model change; the `Entity<Space>` change is a comment only).

## 🏗️ Architecture Notes
- **`router.replace` verdict (requested):** *in-scope, not scope-creep.* The route is keyed by the space id; without reconciling it, SpaceView's vanish-watch bounces the user. It is a justified completeness step — the problem is the ordering in [M1], not the decision to touch the route.
- The reconcile also moves `currentId`, `contentsLoading`, `contentsFailed`, and the `space:{id}` scalar `saveState` beyond the plan's enumerated five maps. This is *correct* completeness — it matches exactly the space-keyed state `discardSpaceLocally` (`:200-213`) and `removeSpace` clean up. Good.
- `createRemote` keeps the optimistic push synchronous in the callers and only finalizes on server response; the `creatingSpaces` flush-gate + `reconcileSpaceId` reschedule correctly prevent a staged granular edit from flushing against the temp id (the store's documented BUG-2/3 class). The create-failure path (`discardSpaceLocally`) properly `clearTimeout`s, so no wedged timer.

## 👍 Positives
- Handler generates the id **after** `CheckNewSpace` and `SpacePhotoGuard` and logs the *generated* id — ordering and the "never trust `dto.Id`" invariant are exactly right.
- `SpaceDto.ToEntity(userId, spaceId)` re-stamps every child zone/item `SpaceId` with the server id; the old single-arg overload is retained for other callers. Clean.
- `api.create` returns `Promise<Space>`, so `created.id` is well-typed — no `any`, no duplicated Kiota type.
- `SpaceIdGenerator`: 16 CSPRNG bytes → 22 base64url chars + `"space_"` = 28, comfortably under `nvarchar(64)`. Registered singleton (stateless). Interface in Domain, impl in Infrastructure — correct layering.
- The corrected comments in `TidansuDbContext` and `SpacesRepository` close the S-L2 "don't read tenant isolation as structural for Space" tripwire the brief asked for.

## Acceptance criteria unproven by the no-browser gap (requested)
Statically proven from code: server ignores `dto.Id` (FR-1/FR-3 id-forgery), no EF migration/no Kiota regen, the flush-gate/reconcile logic, existing rows coexist (no schema change).
**Unproven without a drive:**
- **FR-6** — "appears immediately, then fully usable, edit a zone/item right after creation lands (no 404, no bounce)." This is exactly [M1]; the highest-value gap.
- **FR-4** — >20 creates/min → 429, per-account (not per-IP), other limiters still fire after the `UseRateLimiter` move. (Also security-reviewer scope.)
- **FR-5** — a representative sample (single Free, at-cap Free, over-cap read-only, Pro with photos) still loads/edits/deletes; client-id and server-id spaces coexist; space-delete cascade still fires.

## Action Checklist
- [x] [M1] Reorder reconcile so the route lands on `newId` before `space.id` mutates (or make SpaceView's vanish-watch reconcile-tolerant); then browser-drive onboarding create and confirm no dashboard bounce. Escalate to Critical if it reproduces. — Fixed in `useSpacesStore.ts`'s `reconcileSpaceId` (now `async`, awaits `router.replace` before mutating `space.id`); manual browser drive **did** reproduce a follow-on regression — see [M1-b] below, now fixed.
- [ ] [N1] Narrow the retry catch to unique-violation SQL numbers, or comment the broad catch as accepted.
- [ ] [N2] Optionally move the `DbUpdateException` retry into Infrastructure to keep Application EF-free.
- [x] Run the unchecked FR-4/FR-5/FR-6 manual drive before merge. — FR-6 drive done, found [M1-b], now fixed; awaiting confirmation drive.

## 🔴 [M1-b] Confirmed live: M1's fix still stranded the URL on the temp id (escalated to Critical, now fixed)

**Date found**: 2026-07-23. **Reproduction**: logged-in Free user → "New space" → pick type → Continue → name it → "Start adding items". URL became `/spaces/space_noj0` (client temp id); `POST /api/spaces` returned 200; `GET /api/spaces/space_noj0` returned 404; screen stuck on "Loading…" permanently. The store's own state was fully correct — `currentId` and the `spaces` array both held the server id, the temp id was gone — only the router URL never moved off it.

**Root cause — M1's fix was real but its *trigger condition* raced the same way the original bug did.** M1 correctly made `reconcileSpaceId` `async` and reordered it to `await router.replace` before mutating `space.id`. But it still *decided whether to fire that replace* by reading `router.currentRoute.value` — the router's *settled* state — at the moment `createRemote`'s `api.create()` resolved. `CreateSpaceView`'s own `router.push({ name: 'space', params: { id: localId } })` resolves asynchronously (route guards, the lazy-loaded `SpaceView` chunk). On the live drive, the API response won the race against that navigation settling: `reconcileSpaceId` ran while `router.currentRoute.value.name` still named the onboarding wizard, so `current.name === 'space' && current.params.id === oldId` was `false`, the `router.replace` was skipped entirely, and `space.id` flipped to the server id with the route never touched. `CreateSpaceView`'s own `push(oldId)` then landed afterwards — for good, since nothing in the store answered to `oldId` any more.

**Fix**: replaced the `router.currentRoute`-based check with a synchronous navigation-*intent* flag. Added `goToSpace(id)` to `useSpacesStore` — the single place a view asks to navigate to a space's route — which sets a module-local `spaceRouteTarget = id` the instant it's called (before `router.push` even starts resolving) alongside the actual `router.push`. `reconcileSpaceId` now checks `spaceRouteTarget === oldId` instead of the live route, so it can no longer be fooled by how far the router's own async navigation has progressed. `CreateSpaceView.finish()` and `DashboardView.openSpace()` now call `store.goToSpace(id)` instead of driving `router.push` themselves. `discardSpaceLocally` clears `spaceRouteTarget` if it pointed at the discarded space (a failed create), so a stale target can't cause a spurious re-route later.

**Test added**: `src/stores/useSpacesStore.createNavigate.test.ts` — mocks a **successful** `api.create` (the class of path the original M1 review flagged as completely untested) with `vue-router`'s `currentRoute` pinned to a value that never advances (reproducing the exact "settled route lags behind" condition observed live), then asserts `router.replace` is called with the **server** id and never with the temp id. Verified this test fails against the pre-fix code (`store.goToSpace is not a function`, and — before `goToSpace` existed at all — would fail the `currentRoute`-based check the same way production did) and passes after the fix.

**Verification**: `npm run build` (vue-tsc) green; full `vitest run` green, 39/39 (was 38/38 — one new test file, one new test). Manual browser re-drive of the exact repro steps still pending human confirmation.
**Category**: Correctness / Functional (FR-6), confirmed live regression.
