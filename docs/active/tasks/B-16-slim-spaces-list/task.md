---
id: B-16
slug: slim-spaces-list
title: Paginate/slim the spaces list; stop returning photo data-URLs inline (SC-3)
status: in-review   # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: []         # B-13, B-14, B-15 have all landed; their conclusions are inherited below
touch-points:
  - src/Tidansu.Application/Spaces/Queries/GetSpaces/GetSpacesQueryHandler.cs
  - src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs   # GetAllByUserAsync
  - src/Tidansu.Application/Spaces/Dtos/                          # ItemDto — read/write shape split (see TRAP)
  - src/Tidansu.Application/Spaces/Commands/UpdateItem/           # full-replace of Photo (see TRAP)
  - src/Tidansu.App/src/App.vue
  - src/Tidansu.App/src/stores/useSpacesStore.ts
  - src/Tidansu.App/src/api/apiClient/                            # Kiota regen (contract changes)
---

# B-16 · Paginate/slim the spaces list; stop returning photo data-URLs inline

## Description
From the B-8 audit (🟠 SC-3). `GET /api/spaces` returns every space, zone and item
for the account, with each item's `Photo` base64 data-URL inline and no paging —
all eagerly loaded on app boot. A heavy Pro account therefore pulls a tens-of-MB
response that grows unbounded as they add photo items, and the client is forced to
hold the entire account in memory before it can show anything.

After this slice a user's app boot should stay fast and light regardless of how many
spaces or items they own: the read path carries the text-only layout graph, photo bytes
never travel with it, and the client no longer needs the whole account at once.

> **⚠️ Read the THIRD scope decision below — it is the final one.** The first two are kept
> only as the audit trail of how the scope moved; they are **superseded** and following them
> will build the wrong thing.

## Scope decision (made by the user at kickoff) — ⚠️ SUPERSEDED, see the third decision
The backlog offered two tracks; the user chose **both**:
- **(a)** Photos out of the list payload — ~~return a reference, fetch the image separately~~
  (the "fetch separately" half is now B-1's; B-16 only stops shipping the bytes).
- **(b)** Paging / per-space lazy-load so the client isn't forced to hold the whole account.

~~**Photo storage location is deliberately left open for the tech-lead**~~ — **moot.** With no
serving endpoint in scope, there is no reason to move photo bytes anywhere. Default to leaving
storage exactly as it is; a migration or new infra now needs explicit justification at the gate.

### Second scope decision (2026-07-16 gate — after the requirements stage exposed the real premise)

The requirements stage established, and the orchestrator independently verified, that
**the photo feature does not exist in the UI**:
- No `<img>` anywhere binds `item.photo` — nothing can display a photo.
- `ItemDetailModal.vue:172` emits `addPhoto`, but `SpaceView.vue:66-70` wires only
  `@photo-locked` and never listens for it — **the emit goes nowhere**, so a Pro user
  cannot create a photo either.
- `Item.Photo` is a pure backend/DTO round-trip inherited from the prototype data-model port.
- Backlog **B-1** ("item photos on Pro") is explicitly *"illustrative, not scheduled"*.

Therefore SC-3's tens-of-MB payload is **real in shape but latent in practice** — only a
direct API caller can currently store a photo. The user was shown this, offered a narrower
slice (slim the list, don't build serving), and **deliberately chose the fullest scope**:

- ~~B-16 builds the whole photo feature~~ — **REVERSED, see the third decision below.**
- ✅ **FR-9 (paginating the space list itself) is IN this slice**, not deferred to Phase 2.

### Third scope decision (2026-07-16 — FINAL; supersedes the photo half of the second)

The user reconsidered and **split the photo feature back out**. Final B-16 scope:

**IN scope:**
- **(a)** Photo bytes never travel in the spaces list/graph read path (the SC-3 fix).
- **(b)** Progressive loading — the dashboard renders without loading every space's full
  contents; a space's contents load when opened.
- **FR-9** — paginating the space list itself. Still IN (that decision was not reversed).

**OUT of scope — belongs to backlog B-1 ("item photos on Pro"), which stays its own slice:**
- Photo **upload/capture** (wiring the dead `addPhoto` emit to something real).
- Photo **display** (there is no `<img>` bound to a photo anywhere today).
- The photo-**serving** endpoint, and with it the whole **B-13 polyglot** delivery risk.

Rationale: the photo feature does not exist in the UI (see the verified findings below), so
building a serving endpoint here would ship the B-13 security surface for a feature with no
upload path and no users. B-16 keeps SC-3's payload fix — which stands on its own — and B-1
owns the byte path when the feature is actually built.

**Consequence for the tech-lead:** with no serving endpoint, the storage question (DB vs blob)
is very likely **premature** and should default to *leave storage as-is*. If the plan proposes
a migration or new infra, that needs to be justified explicitly at the gate, not assumed.

### 🪤 TRAP — verified by the orchestrator, must be handled (2026-07-16)
**Dropping `Photo` from the read path can silently delete photos.**
- `ItemDto` (`src/Tidansu.Application/Spaces/Dtos/ItemDto.cs`) is used for **both** read
  (`FromEntity`) and write (`ToEntity`) — one shape, both directions.
- `UpdateItemCommandHandler.cs:63` does `item.Photo = dto.Photo` — a **full replace**, not a patch.
- Therefore: if `GET` stops returning `Photo`, the SPA store holds none, and the next item edit
  PUTs `Photo: null` → **the stored photo is wiped**. Same hazard for any other client that
  round-trips an item it read.
- Note `UpdateItemCommandHandler.cs:40` already carries a `TRAP (T-13e)` comment about photo
  ordering on this exact path — this area is known-delicate; read it before touching it.

**The tech-lead must decide explicitly** between (at least): diverging the read and write DTO
shapes, or giving the update patch semantics where an absent photo means "leave unchanged".
Whichever is chosen, "a stored photo survives an item edit made by a client that never received
it" is a hard acceptance criterion — and it must be **proven by driving**, not asserted.

### Decisions taken by the orchestrator from documented rules (not open questions)
- **The "heavy account" benchmark.** Use **3 spaces × 20 photo items × ~1.5 MB each**
  (~90 MB pathological worst case), measured as raw `GET /api/spaces` response bytes before
  vs after. Must be *measured and recorded*, not asserted. Photos must be **seeded via the
  API** — the UI cannot create one.
- ~~**Downgraded Pro→Free user's existing photos.**~~ **Moot in B-16** — with no display path
  there is no viewing behavior to specify. Hand to **B-1**, where the rule to apply is the
  already-documented one (`CLAUDE.md`: *"Downgrade keeps data but makes over-cap content
  read-only"*, Free is *"no photos"*) → a downgraded user may **view** stored photos but
  adding/replacing opens the paywall with `reason: photos`. Recorded here so B-1 doesn't
  re-derive it.

## Acceptance criteria
- [x] `GET /api/spaces` no longer contains any photo base64 — verified against a real
      response body for an account that has photo items (seed them via the API; the UI
      cannot create one).
- [x] 🪤 **A stored photo survives an item edit** made by a client that never received the
      photo — proven by driving (read an item, edit its name, confirm the photo is still in
      the DB). See the TRAP note below; this is the single highest-risk regression here.
- [x] Boot payload for the agreed heavy-account benchmark is bounded and small — **measured**
      before/after, not assumed.
- [ ] The client no longer eagerly loads every space's full contents on boot (per-space
      lazy-load), and the dashboard still renders correctly. **Lazy-load mechanism proven at
      the API level** (GET /{id} is the only path that returns zones/items; the list never
      does); **"the dashboard still renders correctly" not visually driven** — no browser
      tooling available this pass.
- [ ] The space list itself is paginated (FR-9) and the dashboard renders correctly across
      the page boundary. **Pagination mechanism proven** (deterministic, disjoint,
      correct `totalCount`, correct clamp/400s); **"the dashboard renders correctly" not
      visually driven** — no browser tooling available this pass.
- [ ] A "still loading" state for a space's contents is visibly distinct from the genuine
      empty state — a loading space must never look like an empty one (cf. B-18's bug). Purely
      a UI/visual criterion — **not driven**, no browser tooling available this pass.
- [x] Free/Pro plan gating is unchanged: no plan-cap path
      (`spaces`/`zones`/`items`/`photos`/`sync`) regresses. In particular the `photos` gate
      on item create/update still fires exactly as today.
- [x] No regression to B-15's granular zone/item endpoints or B-12's space-cap app-lock.

**Explicitly NOT acceptance criteria for B-16** (moved to B-1 with the photo feature): a photo
being *displayed*, a photo being *uploaded* from the UI, owner-only *fetching* of photo bytes,
and the safe-delivery/`nosniff` requirement — none of which can be met while no serving
endpoint exists.

## Notes

### Review follow-up: M1/N1/N2 fixed (2026-07-19)

Applied the three `review.md` findings in the frontend per-space loading seam
(`useSpacesStore.ts` + `SpaceView.vue`). M2/S-M1 were already fixed in an earlier pass and
were not touched here. See `review.md`'s Action Checklist for the per-finding detail; summary:

- **[M1] Deep-link/refresh to a page-2+ space no longer bounces to the dashboard.**
  `loadSpaceContents(id)` now falls back to `api.get(id)` and inserts the result into
  `spaces.value` when the id isn't among the loaded summary pages, returning
  `'ok' | 'not-found' | 'error'`. `SpaceView`'s id-watch only redirects on a confirmed
  `'not-found'` (a new `isNotFoundError` helper reads the Kiota error's
  `responseStatusCode`). `hydrate()` now merges into `spaces.value` (keeping any
  already-`contentsLoaded` space the new page doesn't include) rather than overwriting it,
  so a concurrent boot-time `hydrate()` can't silently undo the fallback fetch. The normal
  in-page navigation path (space already in the summary list) is unchanged — `loadSpaceContents`
  still short-circuits to `'ok'` when `contentsLoaded` already has the id.
- **[N1] A failed contents fetch no longer wedges an infinite spinner.** Added
  `contentsFailed`/`isContentsFailed(id)` to the store (cleared at the start of every load
  attempt, set on any non-404 failure). `SpaceView` derives `loadFailed` from it and renders a
  `BaseEmptyState` ("Couldn't load this space" + a `BaseButton` "Retry" calling `onRetry`,
  which just re-invokes `loadSpaceContents`) mutually exclusive with the loading state and the
  genuine empty state (`isLoadingContents = !showContents && !loadFailed`).
- **[N2] `duplicateSpace` no longer POSTs an empty copy on a failed fetch.** It now checks
  `loadSpaceContents`'s result and returns `null` (aborts, no POST) unless it resolved `'ok'`.

**Verification:** `npm run build` (vue-tsc + vite build) green; `npm run test` (vitest) 26/26
green, unchanged. `dotnet build` unaffected (no backend files touched). **Not driven in a
browser this pass** — no `mcp__claude-in-chrome__*` tool was present in this session's tool
list, so the actual deep-link-to-page-2 flow, the error/retry UI, and the empty-duplicate abort
could not be visually driven. Verified instead by full read-through of the resulting control
flow (traced both the fast path — space already known, unchanged behaviour — and the fallback
path — unknown id → `api.get` → push → reactive `space`/`showContents` update → `currentId`
set via `lastKnownId` disambiguation, with no double-redirect on a route-id change to another
unloaded space) against the store's and `SpaceView`'s existing conventions.

### UI driving verification (2026-07-19) — the two previously-open boxes, now closed via Chrome

Closed the FR-2/4/5 and FR-6 boxes (and the M1 deep-link fix) by driving the **built** app in
Chrome (served same-origin from `wwwroot` at `http://localhost:5000` — the API booted with
`--no-launch-profile` so it bound the default port, not 5081). Real magic-link sign-in via the
dev "Open the link" button. Seeded a Pro account with **22 spaces** through the API (21 light:
3 zones / 2 items; #22 heavy: 5 zones / 18 items) so `pageSize=20` forces a real page boundary.

- **FR-2 (counts pre-open):** every dashboard card rendered name/type, preview colour bands, and
  correct `itemCount·zoneCount` ("2 items · 3 zones"; heavy card "18 items · 5 zones" with 5 bands)
  with **no space opened** — the counts come from the summary, not loaded items.
- **FR-4/FR-5 (loading vs empty):** opening a space showed a distinct centred **"Loading…"**
  placeholder, then resolved to the full item list — never looked like the genuine empty state.
- **FR-6 (pagination):** page 1 showed exactly 20 cards + a "Load more" button; clicking it
  appended Space 21 + 22 and the button disappeared once all 22 were loaded.
- **M1 (deep-link fix, the review follow-up):** a fresh navigation to `/spaces/drv22` (a page-2
  space absent from the page-1 hydrate) loaded the space **directly** — no bounce to the dashboard.
  An unknown id (`/spaces/does-not-exist-xyz`) resolved to the API 404 and **correctly redirected**
  to the dashboard. Both M1 branches confirmed.
- **Not driven:** N1 (error/retry on a *failed* contents fetch) — would need an induced network
  failure; left as the one un-driven minor. Low risk (transient-only, self-heals on re-nav).

### Driving verification (2026-07-19) — all boxes proven checked off, two left open (no browser tooling)

Ran the full stack against a real LocalDB instance (`dotnet run` on `http://localhost:5081`,
dev magic-link auth per the documented shortcut), with `EnableSensitiveDataLogging` +
Serilog's `Microsoft.EntityFrameworkCore: Information` override surfacing every generated
SQL statement. Seeded a Pro account (`pro-b16@tidansu.local`, upgraded via `DirectBillingService`
— `StripeSettings.Enabled=false` in dev flips the plan instantly, no Stripe needed) and a Free
account (`free-b16@tidansu.local`) via the API (the UI cannot create a photo).

**Both build/test gates green:** `dotnet build` (whole solution, 0 warnings) and
`dotnet test tests/Tidansu.Domain.Tests` (62/62 passing, unchanged — no new Domain rule).
`npm run build` (vue-tsc + vite build) also green.

**FR-1 — proven at the SQL level, not just JSON.** Seeded a Pro item with a genuine
`data:image/png;base64,...` photo (real PNG magic-byte header + 1.5 MB filler — only the
first 12 decoded bytes are sniffed by `PhotoPolicy`, so this is what `SpacePhotoGuard` actually
validates). `GET /api/spaces` returned 305 bytes total (`itemCount`/`zoneCount`/
`previewColors`, zero base64). `GET /api/spaces/{id}` returned 681 bytes with `"photo":null`
on the item. Captured the **exact generated SQL** from the dev log for both:
- Summaries query: `SELECT [s0].[Id], ..., [s0].[c], [s0].[c0], [z2].[Color], [z2].[Id] FROM (...
  COUNT(*) subqueries for zones/items ...) LEFT JOIN (... top-6 zone colours by ROW_NUMBER ...)`
  — **no `Item` table column beyond the `COUNT(*)`** appears in the SELECT list at all.
- Detail query: `SELECT [s0].[Id], ..., [i].[Id], [i].[SpaceId], [i].[Name], [i].[ZoneId],
  [i].[Quantity], [i].[Tags], [i].[DateAdded], [i].[Expiry], [i].[SlotIndex], [i].[Depth],
  [i].[Level], [i].[Icon]` — every `Item` column is listed **except `[i].[Photo]`**. Confirmed
  by name, not inference: the column is absent from the projection, so it never leaves SQL Server.

**FR-3 / 🪤 — the headline, OBSERVED at the DB row level, both directions.** Simulated the
SPA's exact round-trip: `GET /api/spaces/{id}` (photo comes back `null`) → `PUT` the same item
back with a changed name and `photo: null` (what `toItemDtoBody` sends) → re-`GET` and
**inspected the DB row directly via `sqlcmd`**:
- Before: `LEN(Photo) = 2000022`, starts `data:image/png;base64,iVBORw0KGgoAAAA...`
- After the `photo: null` PUT with a renamed item: **`LEN(Photo)` still `2000022`**, same PNG
  header intact, `Name` = "Photo Item (renamed by client that never saw the photo)". The photo
  survived, proven by direct DB inspection (not just the PUT's own response echo).
- Inverse case: a Pro `PUT` with a genuine **non-null** photo (different size, 200 000 → then
  100 000 raw bytes across two further edits) **did** replace the stored photo each time —
  `sqlcmd` confirmed `LEN(Photo)` changed to match (266 690 chars, then a new create at
  133 358 chars) — patch semantics only protects a `null` incoming photo, a real one still
  updates normally.

**FR-9 — real, measured before/after (not estimated).** Seeded the exact benchmark (3 spaces ×
20 items × 1.5 MB raw photo each, ~90 MB of photo bytes, via 60 individual `POST .../items`
calls, ~7 s total) on the Pro account. Rather than reason from an equivalent endpoint, did a
**true before/after on the same account/DB**: `git stash push -u` reverted the entire B-16
diff (backend + frontend + new untracked files) to the pre-B-16 tree, `dotnet build` (green,
0 warnings) against the *unchanged* DB (no migration in this task), ran the old
`GET /api/spaces`, measured, `Stop-Process` the old server, `git stash pop` (working tree back
to the exact pre-stash state, confirmed via `git status`), rebuilt (green), reran the current
`GET /api/spaces`:
- **Before (pre-B-16 code, same account, same 90 MB of stored photos): 120,418,315 bytes**
  (~114.9 MB) — response body contained 62 `base64,` occurrences (60 benchmark items + 2 from
  earlier FR-1/FR-7 seeding on the same account).
- **After (current B-16 code): 968 bytes** — 4 spaces, zero `base64,` occurrences.
- The after-size is driven by space *count*, not photo count/size — confirmed by re-running the
  same request after seeding (968 bytes both before and after the 60-item photo seed touched
  this account, since the account already had a few spaces from earlier tests).

**FR-7 — regression, driven, all six cases.** Free user: item **create** with a valid photo →
`403 {"errors":{"plan":["photos"]}}`. Create with `photo:""` → **still 403, not 400** (proves
the `is not null`-branch preserved B-13's gate-before-guard ordering — an `IsNullOrEmpty` branch
would have let `""` skip straight to `SpacePhotoGuard`'s 400). Create with `photo:null` → 200
(baseline). Update (existing no-photo item) with a valid photo → 403. Update with `photo:""` →
403, not 400. Update with `photo:null` → 200 (patch-semantics no-op, allowed). Pro: create with a
valid photo → 200, photo stored and length-verified (`133358` chars in the response, matching
the 100 000-raw-byte input). Pro update with a valid (different) photo → 200, DB-verified replace
(above). All six outcomes matched exactly.

**FR-8 — regression, driven (not just spot-checked for caps).** Free user: 2nd space → 200 (at
cap); 3rd space → `403 {"plan":["spaces"]}`. Zones: filled an existing space to 6 → 7th zone →
`403 {"plan":["zones"]}`. Items: filled a space to 50 (49 sequential creates, 0 failures, 0.3 s)
→ 51st → `403 {"plan":["items"]}`. **B-12 concurrent-add lock**: freed exactly one item slot
(49/50) on the Free space, then fired 5 concurrent `POST .../items` via a `ThreadPoolExecutor` —
exactly 1 succeeded (200), 4 got `403 {"plan":["items"]}`, final DB count was exactly 50 (never
51+) — the per-space `sp_getapplock` still serialises correctly under real concurrency. **B-15
granular endpoints**: `PUT .../zones/{zoneId}` (rename+recolour) → 200, applied; `POST
.../items` + `DELETE .../items/{itemId}` → 200/204, item confirmed gone on re-`GET`. Zero drift
on any of these.

**IDOR spot-check on the two new read seams (Security section).** Free user's token against the
Pro user's space id on `GET /api/spaces/{id}` → `404`, generic "doesn't exist" message, no graph
leaked. The SQL log for both new queries shows the `WHERE ... [UserId] = @userId` (and
`[Id] = @id AND [UserId] = @userId` for the detail read) parameterised inline — confirmed by
inspection, not just behaviour. Confirmed `AsNoTracking()` is present on `GetLayoutByIdAsync`
(`SpacesRepository.cs:119`); `GetSpaceSummariesPageAsync` projects straight into the `SpaceSummary`
*record* (not an entity), which EF Core never tracks regardless — no explicit call needed there
(matches the tech-plan's own note). The summaries query's zone-colour subquery was confirmed a
**single round-trip** in the SQL log (one `SELECT` with a `ROW_NUMBER()`-windowed `LEFT JOIN`,
not N+1 per space) — `pageSize` clamp confirmed (`pageSize=1000000` → 400; `page=0` → 400).

**FR-6 — proven at the API level only; the UI "Load more" click was NOT driven.** Paged through
the Pro account's 4 real spaces with `pageSize=1`: 4 distinct, non-overlapping ids across pages
1–4, a consistent `totalCount:4` on every page, and an empty `items:[]` (still `totalCount:4`)
on page 5 (beyond the end) — the underlying pagination contract (deterministic ordering, no
overlap, no drop, correct total, graceful overrun) is solid. **Left the FR-6 tech-tasks.md box
unchecked** because its literal wording ("the first page renders, 'Load more' fetches the rest")
names a UI drive, and that piece was not performed — see below.

**NOT driven — no browser tooling available in this environment.** No `mcp__claude-in-chrome__*`
tool was present in this session's tool list, so the actual dashboard (`SpaceCard` rendering,
counts/preview bands, the visually-distinct loading-vs-empty state on `SpaceView`, and the
"Load more" button click) could **not** be visually driven. This mirrors the frontend batch's
own note from the same day. Left the **FR-2/FR-4/FR-5** and **FR-6** `tech-tasks.md` boxes
unchecked rather than asserting an unobserved visual result — everything at the API/DB/SQL-log
level that those criteria depend on (summary payload shape, lazy per-space fetch on `GET /{id}`,
pagination boundary correctness) was proven above and is consistent with what the UI code (already
`vue-tsc`/`vitest`-green per the frontend batch) is wired to call.

### Frontend batch implementation (2026-07-19)
- **`Space.itemCount`/`zoneCount`/`previewColors` are plain fields kept in sync locally**,
  not computeds — every store mutation that touches `zones`/`items`
  (`addItemSmart/Structured`, `removeItem`, `addZoneColumn/Free`, `deleteZone`) now also calls a
  new `refreshSummary(space)` (→ `summarize()` in `data/spaces.ts`), so a card's counts/preview
  stay correct after an in-session edit, not just at initial load. `summarize()` is also used by
  `seedFridge()`/`seedForType()`/`duplicateSpace()`/`toSpace()` so every `Space` constructor path
  produces a consistent summary.
- **`duplicateSpace` had to become `async`.** The dashboard can duplicate a space whose contents
  were never opened (lazy-loaded, so `zones`/`items` are `[]`) — without first awaiting
  `loadSpaceContents(id)`, the duplicate would silently come out empty. This wasn't an explicit
  tech-task line item; it's a direct, necessary consequence of the lazy-load change on a touched
  seam (`DashboardView.vue`'s `onDuplicate` updated to `void store.duplicateSpace(id)`).
- **`store.count` now means the account-wide total** (`total.value` from the last page fetched),
  not `spaces.value.length` (which is only the loaded-so-far count once paginated). This keeps
  the Free space-cap check and the dashboard's "N spaces" subtitle correct across the page
  boundary; `hasMoreSpaces` is the new `spaces.value.length < total.value` computed.
- **Known gap surfaced, not fixed (out of the listed touch points): `AccountView.vue`'s
  `totalItems`/`fullestSpace` usage stats compute client-side from `store.spaces.reduce(...,
  s.items.length)`.** Post-B-16, that undercounts once a space is lazy — `items` stays `[]` until
  the user has opened it in the session. This isn't new dead code B-16 introduced; it's an
  existing client-side computation that this task's lazy-load makes inaccurate. The backend
  already has what's needed to fix it properly — `GetAccountQueryHandler` returns an
  `AccountDto.usage: UsageDto` (moved off `GetAllByUserAsync` back in B-14) — but the frontend's
  `useAccountApi().get()` wrapper is defined and **never called anywhere today**. Wiring
  `AccountView.vue` to that instead of `store.spaces` is a small, well-scoped fast-follow; flagged
  here rather than silently pulled into this batch since `AccountView.vue` wasn't in the
  dispatched touch-point list.
- **`npm run build` (vue-tsc + vite build): green.** `npm run test` (vitest): 26/26 green — updated
  `useSpacesStore.flush.test.ts`'s mock (`api.list` → `api.listPage`/`api.get`; `SPACES_QUERY_KEY`
  → `spacesQueryKey`/`spaceContentsKey`) and `pendingChanges.test.ts`'s `makeSpace()` fixture
  (added the three new required `Space` fields) to match the type change — no behavioural test
  changes, both were type/API-surface follow-ups.
- **Sanity drive performed (not the formal FR-1/3/9/6 drives — those are the next dispatch):**
  ran the API + Vite dev servers, obtained a dev magic-link JWT, seeded a Pro account with a space
  holding a photo item via the API, and confirmed live: `GET /api/spaces?page=1&pageSize=20`
  returns `{items:[{...,zoneCount,itemCount,previewColors}], page, pageSize, totalCount}` with no
  `zones`/`items`/photo bytes; `GET /api/spaces/{id}` returns the full graph with `photo: null` on
  the item that was seeded with a real base64 photo. Browser tooling (Claude in Chrome) was not
  connected in this environment, so the actual dashboard-card/loading-state/"Load more" UI could
  not be visually driven this pass — confirmed instead via `vue-tsc`, `vite build`, `vitest`, and
  forcing Vite to transform every touched module (200 OK, no compile errors in the dev-server log).

### Backend batch implementation (2026-07-19)
- **`GetLayoutByIdAsync` approach: entity-projection (the primary/preferred approach),
  not the `SpaceLayout` fallback.** EF Core translated the nested-collection
  `.Select(s => new Space { Zones = s.Zones.Select(z => new Zone {...}).ToList(),
  Items = s.Items.Select(i => new Item {...omit Photo...}).ToList() })` projection
  without complaint — `dotnet build` is green and the projection compiles/translates
  cleanly. No fallback Domain read-model was needed.
- **Photo column confirmed absent from both new SELECTs at the code level**:
  `GetSpaceSummariesPageAsync`'s `Select` never references `Item.Photo` at all (only
  `s.Zones.Count`/`s.Items.Count`/zone colours), and `GetLayoutByIdAsync`'s `Item`
  projection lists every `Item` field except `Photo`, leaving it at its `null` default.
  (SQL-level confirmation via the EF dev log is a frontend-batch/driving-verification
  task, not re-proven here — see the FR-1 verification item in `tech-tasks.md`.)
- `GetSpacesQueryValidator` follows the FluentValidation style of `ItemDtoValidator`;
  `PagedResult<T>` lives at `src/Tidansu.Application/Common/PagedResult.cs` (first file
  in that new `Common/` folder).
- Kiota regeneration used the documented fallback (see agent memory
  `kiota-regen-tooling`): `swagger tofile` fails against this repo's minimal-hosting
  `Program.cs` (no `Startup` class), so the client was regenerated from a running,
  DB-less instance's `/swagger/v1/swagger.json` instead of `npm run build:api-file`.
  `npm run build:api-fix` / `build:api-client` / `build:api-patch` ran as documented.
  Confirmed clean: `SpaceSummaryDto` and `SpaceSummaryDtoPagedResult` were generated,
  `GET /api/spaces` now takes `page`/`pageSize` query params and returns
  `SpaceSummaryDtoPagedResultApiOperationResult`. No hand-edits under `apiClient/`.
- No EF migration created (none needed — no schema/model change).

### Tech-planning decisions (2026-07-19) — see `tech-tasks.md`
- **FR-3 mechanism CHOSEN: update given photo patch semantics** (`null` incoming `dto.Photo` =
  leave stored photo unchanged; non-null = the existing gate/guard/set path) **+ a photo-less read
  projection**. `ItemDto`/`SpaceDto` wire shapes are UNCHANGED — `ItemDto.Photo` stays for the
  write path, the read just never populates it. Preferred over splitting read/write DTOs: the
  shared shape becomes safe once the handler stops blind-assigning `item.Photo`, and it preserves
  B-13's gate ordering incl. the empty-string-is-a-photo rule (branch on `is not null`, never
  `IsNullOrEmpty`). **Accepted consequence handed to B-1:** photo can no longer be *cleared* via
  update (inert — no UI clears one today).
- **Read seam split (realises the B-14 deepening):** remove single-caller `GetAllByUserAsync`;
  add `GetSpaceSummariesPageAsync` (paginated summary projection — no items/photos) for the list
  and `GetLayoutByIdAsync` (photo-less full graph, `AsNoTracking`) for `GET /{id}`. `GetByIdAsync`
  stays tracked + photo-bearing for `DeleteSpaceCommandHandler`'s cascade.
- **Contract change → Kiota regen:** only `GET /api/spaces` changes shape (now paged
  `SpaceSummaryDto`). `GET /{id}` shape is identical (photo just null). **No EF migration** — no
  schema change; photo storage stays in `Item.Photo`.
- **FR-6 page size PROPOSED (needs gate nod):** offset pagination, `pageSize = 20`, clamp `1..100`,
  `TotalCount` returned, "Load more" UX.
- **Deferred, do not fold in:** `DeleteSpaceCommandHandler` still loads photos via `GetByIdAsync`
  to cascade — a residual SC-3-adjacent cost, but a separate set-based-delete change (out of scope).

### Requirements-stage findings (2026-07-16)
- **The dashboard already needs only a per-space summary, not item content.**
  `SpaceCard.vue` renders name/type, up to 6 zone-color preview bands, and an
  item/zone count — it never reads individual items. That confirms the list can
  slim down to a summary + full-text zone/item graph without losing anything the
  dashboard currently shows, and grounds the natural split: lightweight summary
  up front, full per-space contents (`SpaceView.vue` currently reads straight
  from the fully-hydrated store — that read path is what has to become on-demand)
  only once a space is opened.
- **No photo display surface exists in the SPA today.** Searched every
  component; the only photo-related UI is `ItemDetailModal.vue`'s Pro-gated
  "Add a photo" button, whose click emits `addPhoto` to nothing that consumes
  it. `item.photo` is round-tripped through the store/API/mapping layer but
  never bound to an `<img>` anywhere, and no component reads an item's photo
  for any other purpose either (not even a presence check). This is why
  `requirements.md` FR-1 introduces **no** reference/URL/"has-photo" signal in
  the slimmed list — there is no consumer for one in this slice. Photo
  upload/display/serving are B-1's job (see the Third scope decision above).
- Full reasoning, phasing and open questions: see `requirements.md`.

### ⚠️ Security precondition inherited from B-13 — **NOW HANDS OFF TO B-1, NOT B-16**
B-13 validates a photo by sniffing only the **first 12 bytes** against JPEG/PNG/WebP magic
bytes, so a **polyglot** (valid PNG header + HTML/script tail) *is storable today*. That is
inert while photos are never served — nothing in the SPA renders one at all.

**This precondition fires only when photos are actually served from an endpoint**, which the
third scope decision moved **out of B-16 and into B-1**. B-16 does not build a serving path,
so it does not trigger this. **Do not implement photo serving here to "satisfy" this note.**

Carry the following to **B-1** verbatim when that slice starts — it must not be lost in the
hand-off:
- If the serving endpoint sets `Content-Type` from the stored *declared* type, the polyglot
  tail becomes a response body.
- The global `nosniff` header (`Program.cs`) defuses this **only if the new endpoint actually
  inherits that middleware** — verify by driving, do not assume.
- Prefer serving with a **fixed** content type (and/or a separate origin/bucket), never one
  derived from client-declared data.
- **Do not treat B-13's validation as sufficient once photos are served.**

B-16's one residual duty here: it must not make the polyglot situation *worse* — i.e. don't
add any path that echoes stored photo bytes back with a client-influenced content type.

### Inherited from B-14 (deferred here by decision, not oversight)
B-14 moved account-usage counts off `ISpacesRepository.GetAllByUserAsync`, so
`GetSpacesQueryHandler.cs:15` is now its **only** caller. That method's `Include`(zones+items)
+ `AsSplitQuery` shape exists solely to serve the layout view and could be renamed/narrowed to
say so — a real deepening opportunity left for B-16 **precisely because B-16 reworks that same
method**. Weigh it as part of this task rather than re-deriving it.

Sibling methods in `SpacesRepository.cs` already carry the projection discipline this task
needs (`GetItemCountsPerSpaceAsync`, `GetByIdWithoutContentAsync`), including explicit "do not
simplify this back into `GetAllByUserAsync`" comments — follow that established pattern rather
than inventing a new one.

### Related / out of scope
- Keep **separate from B-10** (async Stripe payments) — no overlap.
- **B-22** (client-supplied zone/item PKs → cross-tenant DoS) is a known open P1 and is *not*
  this task's job. Don't fold it in; don't "fix" it here.
- The photo-storage question overlaps a possible future photo-upload rework; this slice should
  not expand into one.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
