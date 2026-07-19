# B-16 · Technical Tasks — Slim/paginate the spaces list; stop shipping photo bytes inline

Scope is the FINAL (third) decision in `task.md`: **payload + loading fix only**.
No photo upload, no photo display, **no serving endpoint**, and — with no serving
path — **no photo-storage migration and no EF migration at all** (photo bytes stay
in the existing `Item.Photo` `nvarchar(max)` column). If you find yourself adding a
migration, stop: it is out of scope (see Open Question 3).

**The whole slice is two seams, deepened, plus one behavioural fix:**
1. **The read seam** (`ISpacesRepository`) stops loading the `Photo` column and stops
   returning the whole account at once — split into a *paginated summary* read and a
   *photo-less full-graph* read. This is the B-14 deepening opportunity realised.
2. **The write seam** (`UpdateItemCommandHandler`) gains **patch semantics for the
   photo field** so the now-photo-less read round-trip cannot silently wipe a stored
   photo (the 🪤 TRAP / FR-3). This is the single highest-risk item — prove it by driving.

The `ItemDto` / `SpaceDto` wire shapes do **not** change. `ItemDto` keeps its `Photo`
field (the write path still needs it for the `photos` gate); the read path simply
never populates it. So the only contract change forcing a Kiota regen is `GET
/api/spaces` becoming a **paged list of a new `SpaceSummaryDto`**.

---

## 1. 📋 Technical Tasks

### Backend — Domain

- [x] **create** the list read-model `SpaceSummary` in `src/Tidansu.Domain/Repositories/SpaceSummary.cs`
  — a record carrying `Id, Name, Type, ViewMode, CanvasMode, LayoutColumns, ColumnLabels,
  ZoneCount, ItemCount, PreviewColors` (`IReadOnlyList<string>`, the first 6 zone colours
  ordered by `Zone.Position`). It is a projected read shape, not an entity — mirror the
  precedent that `ContentInsertOutcome` (same folder) is a repository-owned Domain type, and
  the `List<int>` return of `GetItemCountsPerSpaceAsync` (a projection, not a graph).
  (Domain has zero EF dependencies — this is a plain record.)

### Backend — Application

- [x] **create** `PagedResult<T>` in `src/Tidansu.Application/Common/PagedResult.cs` — `Items`
  (`IReadOnlyList<T>`), `Page`, `PageSize`, `TotalCount`. Keep it a plain generic DTO; the
  client derives `hasMore` from `Page * PageSize < TotalCount`. (No existing paged envelope
  in the codebase — this is the first; keep the shape minimal so it can be reused.)
  ⚠️ This is a new response contract → drives the Kiota regen below.

- [x] **create** `SpaceSummaryDto` in `src/Tidansu.Application/Spaces/Dtos/SpaceSummaryDto.cs`
  with a static `FromSummary(SpaceSummary s)` mapper — mirror the hand-written static-mapper
  shape of `ItemDto.FromEntity` / `ZoneDto.FromEntity` (patterns.md: "mapping is hand-written
  static methods, not AutoMapper"). Fields = the `SpaceSummary` fields; `PreviewColors` copied
  as a `List<string>`. **No `Items`, no `Zones`, no photo/`hasPhoto` signal** (FR-1 constraint:
  invent no consumer that doesn't exist).

- [x] **modify** `GetSpacesQuery` in `src/Tidansu.Application/Spaces/Queries/GetSpaces/GetSpacesQuery.cs`
  to carry `int Page` and `int PageSize` and return `PagedResult<SpaceSummaryDto>` instead of
  `List<SpaceDto>`.

- [x] **create** `GetSpacesQueryValidator` beside it (`.../GetSpaces/GetSpacesQueryValidator.cs`)
  — `Page >= 1`; `PageSize` between `1` and `100` (server clamp, see Scalability). Mirror an
  existing FluentValidation validator (e.g. `ItemDtoValidator`). ⚠️ Validation runs before the
  handler — that is correct here (a bad page is a 400, no plan gate involved).

- [x] **modify** `GetSpacesQueryHandler` in `.../GetSpaces/GetSpacesQueryHandler.cs`: resolve the
  user id (unchanged), call the new `GetSpaceSummariesPageAsync(userId, skip, take)` +
  `CountByUserAsync(userId)`, and return a `PagedResult` of `SpaceSummaryDto.FromSummary`.
  `skip = (Page - 1) * PageSize`. Reads are projection-only (patterns.md).
  ⚠️ Owner-scope is enforced inside the repo `Where(s => s.UserId == userId)` — keep it there.

- [x] **modify** `GetSpaceQueryHandler` in `src/Tidansu.Application/Spaces/Queries/GetSpace/GetSpaceQueryHandler.cs`
  to call the new **photo-less** full-graph read `GetLayoutByIdAsync(id, userId)` instead of
  `GetByIdAsync`. Mapping (`SpaceDto.FromEntity`) is unchanged — the returned items simply carry
  `Photo == null`, so the `SpaceDto` wire shape is identical (no Kiota impact for this endpoint).

- [x] **modify** `UpdateItemCommandHandler` in `src/Tidansu.Application/Spaces/Commands/UpdateItem/UpdateItemCommandHandler.cs`
  — **the FR-3 / 🪤 fix.** Give the photo field **patch semantics: a `null` incoming
  `dto.Photo` means "leave the stored photo unchanged"; a non-null `dto.Photo` runs the exact
  gate/guard/set path that exists today.** Concretely, wrap the photo block in `if (dto.Photo
  is not null)`:
  ```
  var existingPhoto = item.Photo;              // keep the T-13e ordering: read BEFORE any assign
  if (dto.Photo is not null)                   // present → set/change path (gated as today)
  {
      var photoChange = PhotoPolicy.PhotoChangeBetween(existingPhoto, dto.Photo);
      if (PlanPolicy.CheckItemPhotoChange(user.Plan, photoChange) is { } reason)
          throw new PlanLimitException(reason);
      SpacePhotoGuard.ThrowIfInvalid(dto.Photo, "Item.Photo");
      item.Photo = dto.Photo;
  }
  // else: dto.Photo is null → do NOT touch item.Photo (patch semantics, FR-3)
  ```
  Assign every **other** field unconditionally as today. Do not move `item.Photo = dto.Photo`
  out of the guard.
  ⚠️ **Branch on `dto.Photo is not null`, never `string.IsNullOrEmpty`.** Empty-string `""`
  counts as a photo (`PhotoPolicy` D-2 / memory: `PhotoChangeBetween(null, "")` is `Added`); an
  `IsNullOrEmpty` branch would let a Free `photo: ""` skip the 403 gate and hit the 400 guard,
  inverting B-13's ordering. Read the existing `TRAP (T-13e)` comment at line 40 before editing.
  ⚠️ **Consequence to record (hand to B-1):** with `null == unchanged`, an item's photo can no
  longer be *cleared* (set to null) through this endpoint by anyone, incl. Pro. No UI clears a
  photo today, so this is inert; B-1 owns a real clear affordance when photo UX exists.

### Backend — Infrastructure

- [x] **modify** `ISpacesRepository` in `src/Tidansu.Domain/Repositories/ISpacesRepository.cs`:
  - **remove** `Task<List<Space>> GetAllByUserAsync(...)` (B-14 left it single-caller precisely
    so B-16 could narrow it — see its review N2 "rides along with B-16").
  - **add** `Task<List<SpaceSummary>> GetSpaceSummariesPageAsync(string userId, int skip, int take, CancellationToken)`
    with an XML-doc in the style of `GetItemCountsPerSpaceAsync`: *projects to summary columns +
    a per-space `COUNT(*)` + top-6 zone colours; loads no items and no photo payload; do not
    "simplify" back into a `.Include(Items)` graph.*
  - **add** `Task<Space?> GetLayoutByIdAsync(string id, string userId, CancellationToken)` with an
    XML-doc: *the read-only, photo-less full graph for one space (zones + items with `Photo`
    left null), `AsNoTracking`. Distinct from `GetByIdAsync`, which stays tracked + photo-bearing
    for the delete cascade — do not merge them.*
  - **keep** `GetByIdAsync` (still used by `DeleteSpaceCommandHandler`, which needs the tracked
    graph to cascade).

- [x] **modify** `SpacesRepository` in `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs`:
  - **delete** `GetAllByUserAsync` (lines 14–20).
  - **add** `GetSpaceSummariesPageAsync` — a single projecting query, **no `Include`**:
    `dbContext.Spaces.Where(s => s.UserId == userId).OrderBy(s => s.Id).Skip(skip).Take(take)
    .Select(s => new SpaceSummary(... , s.Zones.Count, s.Items.Count,
    s.Zones.OrderBy(z => z.Position).Take(6).Select(z => z.Color).ToList()))`. `AsNoTracking`
    (projection to a non-entity is untracked anyway). Carry the sibling-method "no photo/item
    column leaves SQL" comment.
    ⚠️ Order by a **stable** key (`s.Id`) so paging is deterministic across requests.
  - **add** `GetLayoutByIdAsync` — projects the full graph **without the `Photo` column**. Primary
    approach: project into entity instances leaving `Photo` unset —
    `.Where(s => s.Id == id && s.UserId == userId).Select(s => new Space { …scalars…,
    Zones = s.Zones.OrderBy(z => z.Position).Select(z => new Zone { … }).ToList(),
    Items = s.Items.Select(i => new Item { Id = i.Id, …every field EXCEPT Photo… }).ToList() })
    .AsNoTracking().FirstOrDefaultAsync(...)`. **Photo is never referenced in the SELECT**, so the
    `nvarchar(max)` never leaves SQL. If EF rejects the entity-projection (composing nested
    collection `new`s), fall back to a `SpaceLayout` Domain read-model record + an
    `SpaceDto.FromLayout` mapper — note which you used in `## Notes`.
  - ⚠️ Both new reads MUST keep the `Where(... && s.UserId == userId)` owner filter inline (D-3) —
    a stranger's/unknown id returns empty/null, never a distinct signal.

- [x] **verify** no `ServiceCollectionExtensions` change is needed (interface impl already
  registered; method signatures changed, not the type). No new DI registration.

### Backend — API

- [x] **modify** `SpacesController.GetSpaces` in `src/Tidansu.API/Controllers/SpacesController.cs`
  to bind `[FromQuery] int page = 1, [FromQuery] int pageSize = 20` (default = the proposed 20,
  see Open Question 2), forward them on `GetSpacesQuery`, and return
  `Ok<ApiOperationResult<PagedResult<SpaceSummaryDto>>>`. Update the `[ProducesResponseType]` and
  the `<summary>` ("A page of the current user's space summaries — no zones, items or photos").
  Body is only `mediator.Send(...)` (patterns.md). `GetSpace` (`GET /{id}`) is unchanged.
  ⚠️ This changes the `GET /api/spaces` response contract → Kiota regen (next section).

### Kiota regeneration (gate between backend and frontend)

- [x] **regenerate** the Kiota client: from `src/Tidansu.App` run `dotnet build` of the API first
  (so the swagger DLL is current), then `npm run build:api`. ⚠️ Never hand-edit
  `src/api/apiClient/`. This must land before any frontend task below consumes
  `PagedResult<SpaceSummaryDto>`.

### Frontend — types & API client

- [x] **modify** `src/Tidansu.App/src/data/types.ts`: extend `Space` with the summary-carried
  fields `itemCount: number`, `zoneCount: number`, `previewColors: ZoneColor[]`. (Full `zones`
  and `items` arrays stay, but are **empty until the space is opened** — they are lazy-loaded.)

- [x] **modify** `src/Tidansu.App/src/api/spaceMapping.ts`:
  - **add** `toSpaceSummary(dto: SpaceSummaryDto): Space` → a `Space` with `zones: []`,
    `items: []`, and `itemCount/zoneCount/previewColors` set from the DTO.
  - **keep** `toSpace` for the full-graph fetch; `toItem` already coalesces `photo ?? null`, so a
    photo-less item maps to `photo: null` with no change.

- [x] **modify** `src/Tidansu.App/src/composables/useSpacesApi.ts`:
  - **change** `list()` → `listPage(page: number, pageSize: number): Promise<{ spaces: Space[];
    total: number; page: number; pageSize: number }>` wrapping `client.api.spaces.get({
    queryParameters: { page, pageSize } })`, mapping items via `toSpaceSummary`.
  - **add** `get(id: string): Promise<Space>` wrapping `client.api.spaces.byId(id).get()` →
    `toSpace` (full, photo-less graph). Mirror the existing `useSpacesApi` wrapper style.

- [x] **modify** `src/Tidansu.App/src/queryClient.ts`: keep `SPACES_QUERY_KEY` for the summaries
  list (now page-scoped, e.g. `['spaces', page]`) and add a per-space contents key helper
  `spaceContentsKey(id) => ['space', id]`. (TanStack keys: mutations already flow through the
  store; this only scopes the two reads.)

### Frontend — store (the progressive-loading seam)

- [x] **modify** `src/Tidansu.App/src/stores/useSpacesStore.ts`:
  - **change** `hydrate()` to fetch **page 1 of summaries** via `listPage(1, PAGE_SIZE)`, set
    `spaces.value`, remember `total`/`loadedPages`. Keep the "seed a starter fridge when the
    account has 0 spaces" behaviour keyed off `total === 0`. A locally-seeded/created/duplicated
    space is fully in memory → mark it contents-loaded (see below).
  - **add** `loadMoreSpaces()` — fetch the next page of summaries and append (FR-6). Expose
    `hasMoreSpaces` computed (`spaces.value.length < total`).
  - **add** per-space contents loading: a `contentsLoaded = ref(new Set<string>())` and
    `contentsLoading = ref(new Set<string>())`, plus `loadSpaceContents(id)` — no-op if already
    loaded/loading; else mark loading, `api.get(id)`, merge the returned `zones` + `items` into
    the store's `Space`, refresh `itemCount/zoneCount`, mark loaded, clear loading. Expose
    `isContentsLoading(id)` / `isContentsLoaded(id)` helpers (FR-4/FR-5).
    ⚠️ New/duplicated/seeded spaces created client-side must be added to `contentsLoaded` so
    opening them never triggers a redundant fetch that would clobber unsynced local edits.
  - The optimistic-edit / flush machinery is unchanged: edits only happen inside an opened
    (loaded) space, and `toItemDtoBody` still PUTs the full item incl. `photo: null` — the
    server's new patch semantics (above) is what keeps the stored photo. **No client change is
    needed for FR-3**; do not try to "preserve" a photo the client never received (impossible).

### Frontend — components/views

- [x] **modify** `src/Tidansu.App/src/components/spaces/SpaceCard.vue`: drive `previewBands` from
  `space.previewColors` (already ordered, ≤6) and `countsLabel` from `space.itemCount` /
  `space.zoneCount` instead of `space.items.length` / `space.zones.length` (which are 0 until the
  space is opened). ⚠️ Template-purity: keep these as `computed` (they already are) — map
  `previewColors` to a `{ id, class }[]` computed array, no lookup in the template.

- [x] **modify** `src/Tidansu.App/src/views/DashboardView.vue`:
  - `deleteItemCount` → `deleteTarget.value?.itemCount ?? 0` (items array is empty pre-open).
  - add a **"Load more" affordance** below the grid, shown when `store.hasMoreSpaces`, calling
    `store.loadMoreSpaces()` via a named handler (FR-6). (Simplest testable UX; infinite-scroll is
    a later option — see Open Question 2.) ⚠️ No logic in template — gate the button with a
    `computed`/`v-if` and a named `onLoadMore`.

- [x] **modify** `src/Tidansu.App/src/views/SpaceView.vue`: on the `id` prop (watch, immediate)
  call `store.loadSpaceContents(id)`. Add an `isLoadingContents` computed and render an **explicit
  loading state** (skeleton/spinner) while `isLoadingContents && !isContentsLoaded` — visually
  **distinct** from the genuine empty-space state (FR-5; same bug-class as B-18). The existing
  empty/"no zones yet" branches must only show once contents are **loaded**. ⚠️ Template-purity:
  one `computed` per state (`isLoadingContents`, `showEmpty`, `showContents`); no `&&`/ternary in
  the template.

### Refactoring

- [ ] `[refactor]` Realise the **B-14 deepening**: the removal of `GetAllByUserAsync` and its
  replacement by two intention-named, projection-only reads (`GetSpaceSummariesPageAsync`,
  `GetLayoutByIdAsync`) is the narrowing B-14's review N2 explicitly deferred here. Ensure the new
  methods carry the "do not simplify back into an `.Include` graph" comments so the discipline
  stays structural (locality: the rule lives next to the code it constrains).

- [ ] `[refactor]` Note-only, **do not fix here**: `DeleteSpaceCommandHandler` still uses
  `GetByIdAsync`, loading every item's `Photo` into memory just to cascade-delete a space. That is
  a residual SC-3-adjacent cost on a touched seam but a *different* change (a set-based delete,
  like `RemoveZoneWithItemsAsync`). Out of scope for B-16 — record in `## Notes` / backlog, don't
  fold in (YAGNI + keep the diff honest).

- [ ] `[refactor]` No other refactors in touched files — `SpacesRepository`, the handlers, the
  store and the views already follow the primary-constructor + one-seam + computed-array patterns.

### Verification (no integration/E2E suite exists — drive it)

- [x] `dotnet build` of the solution is green.
- [x] `npm run build` (vue-tsc type-check + build) is green.
- [x] **No Domain unit test added** (no new pure Domain rule — the patch-semantics decision lives
  in the Application handler; `PhotoPolicy.PhotoChangeBetween` is already table-tested). Confirm
  the existing `tests/Tidansu.Domain.Tests` still passes: `dotnet test`.
- [x] **FR-1 — drive it.** Seed (via the API, as a Pro user — the UI cannot make a photo) an item
  with a real `data:image/png;base64,...` photo; `GET /api/spaces` and `GET /api/spaces/{id}` and
  confirm **zero** base64/data-URL content in either body (the list carries no items at all; the
  detail carries items with `photo: null`). Confirm via the dev-only EF SQL log that the `Photo`
  column is not in the SELECT (prove it at the SQL level, not just the JSON — memory: read-path
  projection is proven by the SQL log, not correct-looking numbers).
- [x] **FR-3 / 🪤 — drive it, the headline acceptance.** As Pro, seed an item WITH a photo via the
  API. Open that space in the running app (the client now receives `photo: null`), rename the item,
  let the autosave flush the `PUT`, then re-`GET /api/spaces/{id}` **and** inspect the DB row —
  the photo must still be present. This must be *observed*, not asserted.
- [x] **FR-9 — measured before/after.** Seed the fixed benchmark **3 spaces × 20 photo items ×
  ~1.5 MB each** (~90 MB) via API. Record raw response bytes of `GET /api/spaces` (and
  `GET /api/spaces/{id}`) **before** (git-stash the change / prior commit) vs **after**. Write the
  two numbers into `## Notes`; the after-size must not scale with photo count/size.
- [ ] **FR-2/FR-4/FR-5 — drive it.** Dashboard renders every card (name/type, ≤6 colour bands,
  correct item/zone counts) without any space's contents loaded. Open a heavy space → a **loading
  state** shows, then the full photo-less layout; a genuinely empty space shows the empty state and
  the loading state never flashes for a populated one.
- [ ] **FR-6 — drive it.** With more spaces than `pageSize`, the first page renders, "Load more"
  fetches the rest, and every space stays reachable and correct across the boundary.
- [x] **FR-7 — regression, drive it.** Free user setting a photo on item **create** → 403
  `{plan:["photos"]}` (paywall). Free user sending a non-null photo on item **update** → still 403.
  Free `photo: ""` on create/update → still 403 (not a 400). Pro create/update with a valid photo →
  allowed and stored. Confirms the gate ordering survived the patch-semantics change.
- [x] **FR-8 — regression, drive it.** Space/zone/item cap 403s carry the right `reason`; B-12
  per-space concurrent-add lock still serialises; B-15 granular zone/item add/update/delete
  endpoints still behave. None touched by this change; confirm zero drift.

---

## 2. 🔒 Security Considerations

- **IDOR on the two new read seams.** Both `GetSpaceSummariesPageAsync` and `GetLayoutByIdAsync`
  must keep the `Where(... && s.UserId == userId)` owner filter inline — a cross-user/unknown id
  returns empty/null, never a distinct signal (D-3). 🟠 High.
  - [x] Owner filter present and inline in both new repo methods; verified by a drive with a
    second user's space id returning empty/404.
- **Unbounded `pageSize` → memory/CPU DoS.** A caller could request `pageSize=1e9`. 🟠 High.
  - [x] `GetSpacesQueryValidator` clamps `PageSize` to `1..100`; the controller default is 20.
- **Do not worsen B-13's latent polyglot risk.** B-16 adds no path that echoes stored photo bytes
  back with a client-influenced content type (there is no serving endpoint). 🟢 Low (guard against
  regression only).
  - [x] Confirm no new endpoint returns raw `Photo` bytes; the write path is unchanged.
- **Photo still validated on the write path.** The `photos` gate + `SpacePhotoGuard` remain the
  only way a photo enters storage, unchanged. 🟢 Low.
  - [x] Covered by the FR-7 regression drive.

## 3. 📈 Scalability / Correctness Considerations

- **The whole point: no `nvarchar(max)` photo leaves SQL on any read.** Both new reads project;
  neither `.Include`s `Items` with `Photo`. 🟠 High (this is SC-3).
  - [x] Proven at the SQL level via the dev EF log (FR-1 verification), not just the JSON body.
- **`AsNoTracking` on both new reads** — they feed projection/DTO mapping only, never a mutate
  path. (`GetByIdAsync` stays tracked for the delete cascade.) 🟡 Medium.
  - [x] `AsNoTracking()` (or projection-implicit no-tracking) on both new methods.
- **Deterministic pagination.** Order summaries by a stable key (`s.Id`) so `Skip/Take` pages don't
  overlap or drop rows between requests. 🟡 Medium.
  - [x] `OrderBy(s => s.Id)` before `Skip/Take`.
- **`PreviewColors` correlated subquery stays a single query.** `s.Zones.OrderBy(...).Take(6)`
  inside the summary `Select` — verify it does not fan out to N+1 in the EF log. 🟡 Medium.
  - [x] EF log shows one query (or a bounded split query) for the summaries page, not one-per-space.
- **FR-3 data-loss is the correctness headline** — a performance change that silently deletes user
  photos is worse than the slow status quo. 🔴 Critical.
  - [x] Proven by the FR-3 drive above (photo survives an edit by a client that never received it).

## 4. 📦 New Dependencies

No new dependencies required. `PagedResult<T>` and `SpaceSummaryDto`/`SpaceSummary` are new
first-party types, not packages. **No EF migration** (no schema change — photo storage is
unchanged).

## 5. ❓ Open Questions

1. **FR-3 mechanism — CHOSEN, flagging for the gate.** Update given **patch semantics: `null`
   incoming photo = leave the stored photo unchanged; non-null = gate + guard + set exactly as
   today**, combined with a **photo-less read projection**. The `ItemDto`/`SpaceDto` wire shapes are
   unchanged (`ItemDto.Photo` stays for the write path). Chosen over splitting read/write DTOs
   because the shared shape is now *safe* (the handler no longer blind-assigns `item.Photo`), it
   preserves B-13's gate/guard ordering (incl. the empty-string-is-a-photo rule), and it is the
   smaller, more local change. **Accepted consequence handed to B-1:** a photo can no longer be
   *cleared* (set to null) via update — inert today (no UI clears one). OK to proceed unless the
   gate wants explicit clear-via-update kept.

2. **FR-6 page size / trigger — PROPOSED, needs a nod.** **Offset pagination, `pageSize = 20`
   default, server-clamped `1..100`, `TotalCount` returned** so the client knows when to stop; UX is
   a **"Load more" button** (infinite-scroll deferrable). Rationale: Free (≤2 spaces) always gets
   everything in page 1; the dashboard grid is 3-col so 20 is ~7 rows (well past the fold); offset
   is adequate given spaces are rarely created concurrently. Confirm 20, or pick another number.

3. **Storage / migration — confirming the default.** Plan proposes **no EF migration and no photo
   storage move** (photo bytes stay in `Item.Photo`), per the third scope decision. Raising only
   because the gate asked any migration to be justified explicitly: there is none, and none is
   needed. Confirm.

4. **Not run here (needs the top-level `/build-feature` or main session):** if the gate wants the
   two new read seams explored as competing interface shapes (e.g. Domain read-models for *both*
   reads vs. entity-projection for the graph), that is a `design-an-interface` / `improve-codebase-
   architecture` fan-out the tech-lead cannot launch. Default plan does not require it.
