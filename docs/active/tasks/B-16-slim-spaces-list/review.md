# Code Review: B-16 · Slim/paginate the spaces list; stop shipping photo bytes inline (SC-3)

**Date**: 2026-07-19
**Reviewer**: branch-code-reviewer agent
**Diff base**: origin/main (uncommitted working tree on `main`)
**Files changed**: 29 (backend read seam + write patch + Kiota regen + frontend store/views)
**Scope of this review**: correctness / convention / scope-creep / architecture. Security
(IDOR / plan-gate / fail-open) is covered by the parallel security-reviewer; noted only briefly here.

## Summary
A clean, well-disciplined slice. The headline risk — the 🪤 photo-wipe on the now-photo-less
read round-trip — is handled correctly: `UpdateItemCommandHandler` gains `if (dto.Photo is not
null)` patch semantics that preserve B-13's gate-before-guard ordering, and both new repository
reads project without ever referencing `Item.Photo`. No scope creep (no migration, no photo
upload/display/serving). The two flagged deviations are both correct and safe. Two real
user-facing regressions ride along with the lazy-load/pagination change: deep-link/refresh to a
space beyond page 1 bounces to the dashboard, and `AccountView`'s usage meters undercount for
unopened spaces. Neither is data-loss or security; both are Major and both have small fixes (the
data needed is already on the summary).

## 🔴 Critical (must fix before merge)
None. The single highest-risk item (FR-3 photo survival) is implemented correctly and was
driven-verified at the DB-row level.

## 🟠 Major (strongly recommended)

### [M1] Deep-link / refresh to a space beyond page 1 bounces to the dashboard
**File**: `src/Tidansu.App/src/views/SpaceView.vue:125,141-148` + `src/Tidansu.App/src/stores/useSpacesStore.ts:389-408`
**Category**: Correctness / Functional (pagination regression)
**Description**: `hydrate()` now loads only page 1 of summaries (App.vue:27 on boot,
`useAuth.ts:29` on sign-in). `SpaceView`'s `space` is `store.getById(props.id)`, and its
`watch(space, …, { immediate: true })` does `router.replace({ name: 'spaces' })` the moment
`space` is null. For a Pro user with more than `pageSize` (20) spaces, opening `/space/{id}`
for a space on page 2+ via bookmark or a browser refresh finds no summary in the store → null →
immediate bounce to the dashboard. Pre-B-16 every space was hydrated, so deep-linking worked for
all of them; this is a genuine regression introduced by FR-9 pagination. `loadSpaceContents(id)`
cannot recover it either — it early-returns when `getById(id)` is null (store:437), so it never
fetches a space it hasn't already seen in a summary page.
**Recommendation**: When the routed id isn't in the loaded summaries, fetch it directly instead
of redirecting — e.g. have `loadSpaceContents` (or a new `ensureSpace(id)`) fall back to
`api.get(id)` and insert the returned `Space` into `spaces.value` (mapping the graph + a local
`summarize`) before the `watch` decides it's unknown. Only redirect on an actual 404 from that
fetch. Scope note: this only affects Pro accounts with >20 spaces; if the team accepts it as a
documented fast-follow, record it in the task rather than shipping it silently.

### [M2] AccountView usage meters undercount once spaces are lazy-loaded
**File**: `src/Tidansu.App/src/views/AccountView.vue:258-261`
**Category**: Correctness / Functional (FR-2 — plan-limit display accuracy)
**Description**: `totalItems` and `fullestSpace` compute from `store.spaces.reduce(…, s.items.length)`.
Post-B-16 `s.items` is `[]` until a space is opened this session, so on a fresh load the account
page shows "0 items (all spaces)" and "Fullest space 0" until the user manually visits every
space. FR-2 explicitly requires counts stay accurate for plan-limit displays. The developer
flagged this in `task.md` as a fast-follow needing `useAccountApi().get()` wiring — and correctly,
`account.get()` is defined but never called anywhere (`useSessionStore` only calls `setSync`/
`changePlan`). **But the fix is much smaller than the flagged one**: every summary already carries
`itemCount`, kept in sync locally via `refreshSummary`. Swapping `s.items.length` → `s.itemCount`
restores accuracy for every loaded space with a one-line change, and fully fixes the plan-relevant
Free case (≤2 spaces, always page 1).
**Recommendation**: `totalItems = store.spaces.reduce((n, s) => n + s.itemCount, 0)` and
`fullestSpace = store.spaces.reduce((max, s) => Math.max(max, s.itemCount), 0)`. For the
>20-spaces (multi-page) case, the fully-correct source is the backend `AccountDto.usage`
aggregate via `useAccountApi().get()` — leave that as the documented fast-follow, but ship the
`itemCount` swap now so the page isn't visibly wrong.

## 🟡 Minor (nice-to-have)

### [N1] A failed contents fetch leaves SpaceView on an infinite "Loading…" spinner
**File**: `src/Tidansu.App/src/views/SpaceView.vue:130-131` + `useSpacesStore.ts:435-454`
**Description**: `isLoadingContents = computed(() => !showContents.value)` where
`showContents = isContentsLoaded(id)`. `loadSpaceContents` catches a fetch error, logs it, and in
`finally` clears `contentsLoading` but never adds to `contentsLoaded`. So a transient network
error on `GET /{id}` leaves `showContents` false forever → the loading state renders indefinitely
with no error/retry affordance. It self-heals only if the user navigates away and back (the watch
re-fires). Deriving "loading" from `!loaded` rather than from the store's actual
`isContentsLoading(id)` flag is what conflates "still fetching" with "fetch failed".
**Recommendation**: Track a distinct failed state (or drive `isLoadingContents` off the store's
`isContentsLoading(id)`), and render a small error+retry branch when a load failed. Low urgency —
no error surface exists app-wide today.

### [N2] duplicateSpace can silently produce an empty copy if the contents fetch fails
**File**: `src/Tidansu.App/src/stores/useSpacesStore.ts:503-538`
**Description**: `await loadSpaceContents(id)` swallows its own error (N1). If the fetch fails,
`orig.zones`/`orig.items` stay `[]`, and the duplicate is built empty and POSTed to the server as
a real (empty) space. The user asked to duplicate a populated space and silently gets an empty one.
**Recommendation**: Have `loadSpaceContents` signal failure (return a boolean or rethrow) and abort
`duplicateSpace` (return null / surface a toast) rather than copying an unloaded graph.

### [N3] previewBands key is index-based rather than a stable zone id
**File**: `src/Tidansu.App/src/components/spaces/SpaceCard.vue:99-101`
**Description**: `SpaceSummaryDto.previewColors` is a bare color list (no ids), so the `v-for` key
became `${space.id}-${i}`. Fine for a static preview, but a positional key can cause avoidable
re-renders if the color order ever changes. Acceptable given the summary carries no zone ids;
noting only for completeness.

## 🧭 Convention Violations (project rules)
- [ ] `SpaceCard.vue:55` — `v-if="!previewBands.length"` uses `!` + `.length` in the template
  (a value-producing negation, which the template-purity rule forbids). **Pre-existing** (the line
  is unchanged by B-16; only the computed feeding it changed), so not a merge blocker — but while
  this file is being touched it would be cheap to lift to a `hasPreview`/`showPlaceholderBand`
  computed.
- [ ] `SpaceView.vue:27` — `v-if="viewMode === 'list'"` is an equality comparison in the template.
  Also **pre-existing** (unchanged), noted for the same reason.
- No new template-purity violations were introduced. The B-16-added template code
  (`v-if="isLoadingContents"`, `v-else-if="showContents"`, `v-if="store.hasMoreSpaces"`,
  `@click="onLoadMore"`, the `previewBands`/`countsLabel` computeds, the fully-mapped
  `previewBands` array) is all clean, with the `!` kept inside `isLoadingContents`'s computed.

## 🏗️ Architecture Notes
- **Read seam split is the B-14 deepening, done right.** `GetAllByUserAsync` is fully removed
  (only survives in explanatory comments), replaced by two intention-named, projection-only reads
  (`GetSpaceSummariesPageAsync`, `GetLayoutByIdAsync`), each carrying a "do not simplify back into
  an `.Include` graph" comment that keeps the discipline structural and local. `GetByIdAsync` is
  correctly retained tracked + photo-bearing for the delete cascade. Owner filter is inline in
  both new reads; `OrderBy(s => s.Id)` gives deterministic paging; `AsNoTracking` on the graph read
  and projection-implicit no-tracking on the summary. Textbook.
- **FR-3 patch semantics preserve B-13's gate ordering.** Branching on `dto.Photo is not null`
  (never `IsNullOrEmpty`) keeps `photo: ""` on the 403 plan-gate path rather than letting it fall
  through to `SpacePhotoGuard`'s 400. The `existingPhoto` local is still read before any assign
  (T-13e). The accepted consequence — photo can no longer be *cleared* via update — is documented
  and handed to B-1.
- **DRY: `summarize()`** is a good shared helper, applied at every client-side `Space` construction
  path (seed, seedForType, duplicate, toSpace, and every local mutation via `refreshSummary`), so
  the dashboard-summary fields mirror the server's `SpaceSummaryDto` projection consistently.
- **Layering clean.** `PagedResult<T>` in Application/Common, `SpaceSummary` as a Domain
  repository-owned record (mirrors `ContentInsertOutcome`), hand-written static `FromSummary`
  mapper, controller body is `mediator.Send` only, no EF in Application/Domain. No new DI needed.
- **Deferred, correctly not folded in:** `DeleteSpaceCommandHandler` still loads photos via
  `GetByIdAsync` for its cascade — a residual SC-3-adjacent cost, appropriately left as a separate
  set-based-delete change.

### Deviation verdicts (requested)
1. **`duplicateSpace` → async + awaits `loadSpaceContents` (DashboardView `void store.duplicateSpace(id)`):**
   **Correct and safe.** A lazily-loaded space has empty `zones`/`items`; duplicating without
   awaiting the fetch would copy an empty graph. The `void` fire-and-forget is fine (errors are
   handled inside). Only caveat is the swallowed-failure empty-copy edge (N2).
2. **`store.count` = account-wide `total` (not `spaces.value.length`):** **Correct and safe.**
   `total` is maintained across hydrate/loadMore/add/delete/createError, so the "N spaces" subtitle
   and the Free space-cap `UsageMeter`/`atSpaceLimit` stay correct across the page boundary. Free
   users (≤2 spaces) are always within page 1, so `total === spaces.length` for them regardless.

## 👍 Positives
- The 🪤 FR-3 fix is exactly right and was proven by direct DB-row inspection in both directions
  (null incoming = photo survives; non-null = photo replaced).
- Both new reads verified at the SQL level (dev EF log) to omit `[Photo]` from the SELECT — not
  inferred from JSON.
- `GetSpacesQueryValidator` clamps `PageSize` to 1..100 and requires `Page >= 1` (DoS guard);
  deterministic `OrderBy(Id)`; single windowed subquery for preview colours (no N+1), confirmed in
  the log.
- No scope creep: no EF migration, no photo upload/display/serving, no `hasPhoto` signal invented.
- Tests and mocks updated to the new API surface (`listPage`/`get`, `spacesQueryKey`/
  `spaceContentsKey`); build + vitest green.
- FR-5 is genuinely met: the empty branch (`ItemList`/`LayoutView` empties) only renders under
  `v-else-if="showContents"`, so it can never flash while contents load.

## Action Checklist
- [x] [M1] `SpaceView`/store: fetch a routed space by id (`api.get`) when it's absent from the
  loaded summary pages, instead of redirecting — restores deep-link/refresh for Pro >20-space
  accounts. **Fixed (2026-07-19):** `loadSpaceContents` now falls back to `api.get(id)` and
  `spaces.value.push(...)`s the result when `getById(id)` is null, returning `'ok' |
  'not-found' | 'error'`; `SpaceView`'s id-watch only redirects on a confirmed `'not-found'`
  (404, detected via the new `isNotFoundError` helper on `responseStatusCode`). `hydrate()`
  was also hardened to merge rather than overwrite `spaces.value`, so a concurrent page-1
  hydrate on boot can't silently drop a space this fallback just inserted. Build-verified
  (`vue-tsc` + `vitest` green); not driven in a browser this pass — no browser tooling
  available in this session (see task.md notes).
- [ ] [M2] `AccountView.vue`: `s.items.length` → `s.itemCount` for `totalItems`/`fullestSpace`
  (immediate fix); wire `useAccountApi().get()` usage aggregate as the multi-page fast-follow.
- [x] [N1] Distinguish a failed contents fetch from "still loading" (drive off the store's
  `isContentsLoading` flag + a failed state) so a transient error doesn't wedge an infinite spinner.
  **Fixed (2026-07-19):** added `contentsFailed`/`isContentsFailed(id)` to the store (cleared on
  retry, set on any non-404 `loadSpaceContents` failure); `SpaceView` renders a `BaseEmptyState`
  "Couldn't load this space" + Retry button (`onRetry` → `store.loadSpaceContents(id)` again) when
  `loadFailed` is true, kept mutually exclusive from `isLoadingContents` via the same computed.
- [x] [N2] Abort `duplicateSpace` (or surface an error) when `loadSpaceContents` fails, instead of
  POSTing an empty copy. **Fixed (2026-07-19):** `duplicateSpace` now checks the fetch outcome and
  returns `null` (no POST) unless it resolved `'ok'`.
- [ ] [N3] (Optional) Prefer a stable key over `${space.id}-${i}` for `previewBands` if zone ids
  become available on the summary.
- [ ] (Optional convention, while touched) Lift `SpaceCard.vue:55` `!previewBands.length` and
  `SpaceView.vue:27` `viewMode === 'list'` into computeds.

---

## 🔒 Security Review (net-new)

**Date**: 2026-07-19
**Reviewer**: security-reviewer agent
**Axis**: trust / ownership / plan-gating / fail-open / data-leak only. Correctness/convention
findings (M1, M2, N1–N3) are the branch reviewer's and are **not** re-derived here.
**Type**: Findings only — no code changes made.

**Overall:** Nothing exploitable in the data path. The two new read seams both carry an **inline
owner predicate**, the FR-3 photo patch semantics **preserve B-13's gate-before-guard ordering
under every input** (null / "" / valid / invalid), and the `pageSize` clamp is real and runs
before the handler. The photo column is genuinely absent from both new SELECTs and no
byte-serving surface was added. One net-new low-impact robustness gap: `Page` has no upper
bound, so a crafted large page integer-overflows the `skip` computation into a negative
`OFFSET` → SQL error → 500 (self-inflicted, no data leak).

### Verdicts requested
- **IDOR filters — PASS.** `GetSpaceSummariesPageAsync` (`SpacesRepository.cs:46`) filters
  `Where(s => s.UserId == userId)` inline before `OrderBy/Skip/Take`; `GetLayoutByIdAsync`
  (`SpacesRepository.cs:70`) filters `Where(s => s.Id == id && s.UserId == userId)` inline inside
  the projection root. Both resolve a cross-user/unknown id to `null`/empty via
  `FirstOrDefaultAsync`/an empty list — `GetSpaceQueryHandler.cs:18-19` maps `null` to a generic
  `NotFoundException("Space", id)` (404, no existence oracle). No post-load filtering, no
  bare-id overload. The summaries page cannot be widened past the owner's own rows by any
  `page`/`pageSize` value — Skip/Take only walk within the `UserId ==` result set.
- **Plan-gate ordering — PASS.** `UpdateItemCommandHandler.cs:44,53,61,65` reads `existingPhoto`
  before any assign (T-13e), branches on `dto.Photo is not null` (never `IsNullOrEmpty`), runs
  `PlanPolicy.CheckItemPhotoChange` **before** `SpacePhotoGuard.ThrowIfInvalid`, and only then
  assigns `item.Photo`. Traced against `PhotoPolicy.PhotoChangeBetween` (`PhotoPolicy.cs:159-165`)
  and `PlanPolicy.CheckItemPhotoChange` (`PlanPolicy.cs:83-88`): for a Free/downgraded user every
  non-null photo (including `""` → `Added`, and a *different* photo → `Replaced`) yields the
  `photos` 403; `null` is a no-op that preserves the stored photo; only `None`/`Removed` pass. A
  Free user therefore cannot set, change, or inflate a photo, and cannot reach `SpacePhotoGuard`'s
  400 with `""`. No bypass.
- **pageSize clamp — PASS (with the overflow caveat below).** `GetSpacesQueryValidator.cs:12-13`
  requires `Page >= 1` and clamps `PageSize` to `1..100`. `ValidationBehavior` is registered as an
  open pipeline behavior (`Application/Extensions/ServiceCollectionExtensions.cs:18`) with
  assembly-scanned validators (`:21`) and throws a 400 **before** the handler
  (`ValidationBehavior.cs:26-33`), so `pageSize=1000000` and `page=0` are 400s, never reaching the
  DB. No unbounded `Take`, no negative `Skip` from these two params in isolation.

### Findings

#### 🟡 S-M1 — Unbounded `Page` overflows `skip` into a negative `OFFSET` (500, low-impact DoS)
`GetSpacesQueryValidator.cs:12` bounds `Page` only with `GreaterThanOrEqualTo(1)` — no upper
bound — while `PageSize` is capped at 100. `GetSpacesQueryHandler.cs:16` then computes
`skip = (request.Page - 1) * request.PageSize` in unchecked `int` arithmetic. An authenticated
caller sending e.g. `GET /api/spaces?page=2147483647&pageSize=100` passes validation, but the
product `(2147483646 * 100)` overflows `Int32` and wraps to a **negative** value (`-200`), which
EF Core emits as `OFFSET -200 ROWS`. SQL Server rejects a negative offset, the exception escapes to
`ErrorHandlingMiddleware` as a **500**. Impact is limited: it is the caller's own request, scoped
to their own rows, non-amplifying, and leaks no data (the generic 500 body) — this is a
robustness / defense-in-depth gap, not a cross-tenant or disclosure issue, hence 🟡 not higher.
The branch review credited "the DoS guard" for the `PageSize` clamp; this is the one leg of that
guard that is missing. **Fix:** add an upper bound on `Page` in the validator (e.g.
`InclusiveBetween(1, someMax)` or `LessThanOrEqualTo`), and/or compute `skip` as `long` /
`checked` and clamp `skip >= 0` before `.Skip(...)`.

### Not findings (verified clean — recorded so they aren't re-flagged)
- **Photo-byte leak / B-13 residual — none.** `GetSpaceSummariesPageAsync` projects only
  card/count/zone-colour columns (`SpacesRepository.cs:50-60`) — no `Item` column at all;
  `GetLayoutByIdAsync` lists every `Item` field **except** `Photo` (`:103-117`). No serving
  endpoint, no path that echoes stored bytes with a client-influenced content type. B-16 does not
  make the polyglot situation worse; the B-13→B-1 hand-off is intact.
- **`SpacesController.GetSpaces` auth — unchanged.** Class-level `[Authorize]`
  (`SpacesController.cs:18`) still applies; the handler scopes to
  `userContext.GetCurrentUser().Id` (`GetSpacesQueryHandler.cs:15`) and `CountByUserAsync` is
  owner-scoped. No drift.
- **`GetLayoutByIdAsync` is `AsNoTracking`** (`SpacesRepository.cs:119`) and feeds DTO mapping
  only — no accidental mutate path; the tracked, photo-bearing `GetByIdAsync` is correctly retained
  solely for the delete cascade.

## Verification checklist (net-new)
- [ ] `GET /api/spaces?page=2147483647&pageSize=100` with a valid token → confirm it currently
  returns **500** (negative-OFFSET SQL error in the log), and after the fix returns a clean 400 or
  an empty page — not a 500.
