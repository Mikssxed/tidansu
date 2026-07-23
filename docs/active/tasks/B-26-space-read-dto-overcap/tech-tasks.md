# B-26 · Tech tasks — carry `IsOverCap` on `GET /api/spaces/{id}` via a read-DTO split

> Requirements: [`./requirements.md`](./requirements.md). Depends on B-25 (done).
> Approved decisions: point-in-time staleness on single-space reads is acceptable;
> live mid-session flip is deferred (B-27/sync).

## Split-shape decision (settled — no open dilemma)

**New flat `SpaceReadDto` becomes the sole *response* shape for the space root
(`GET /api/spaces/{id}` AND `POST /api/spaces`); the existing `SpaceDto` keeps its
name and becomes *request-only* (its `FromEntity` is deleted).** Justification:
`SpaceDto`'s write surface turns out to be create-only — there is no whole-graph
PUT anymore (`UpdateSpaceFields` uses `SpaceFieldsDto`; zones/items have granular
endpoints) — so the B-16 "split alone doesn't fix a full-replace round-trip" caveat
does **not** apply here: nothing ever round-trips the space-root shape back to a
full-replace handler, which makes a clean read/write split the *right* fix rather
than a false one. A flat duplicate of the ~9 scalars + `Zones`/`Items` lists (reusing
`ZoneDto`/`ItemDto` as-is — their read/write sharing is settled B-16 patch-semantics
territory, out of scope) is the smallest blast radius: inheritance
(`SpaceReadDto : SpaceDto`) would make the read shape *be* a write shape (violates
FR-2's separation and adds Kiota `allOf` churn); a wrapper/composition shape would
change the response envelope nesting and force bigger SPA rework. Keeping the
`SpaceDto` *name* on the request keeps the Kiota surface for `toDtoBody`/create
unchanged. Switching the **create response** to `SpaceReadDto` too keeps exactly one
response shape and one SPA mapper (`toSpace`); its `IsOverCap` is **deterministically
`false`** on any successful create — both cap paths guarantee `count <= cap`
post-insert (`CheckNewSpace` pre-gate + `AddWithinSpaceCapAsync`'s in-lock re-count),
and Pro is unlimited — so no rank query is needed there (document this in code).

**Over-cap seam (one rule, now four consumers):** deepen `SpaceOverCapGuard` into
the single over-cap *oracle* rather than adding a fourth predicate call site. It
already solves the "single space's rank" problem the read handler needs
(`CountSpacesOrderedBeforeAsync`, collation-matched to `OrderBy(s => s.Id)` — see
its B-24 comment); the read handler must reuse that path, never re-derive rank.
The guard gains `IsSpaceOverCapAsync(spaceId, userId)` (bool); both it and
`EnsureSpaceContentWritableAsync` share one private reason path so the
`PlanPolicy.CheckSpaceContentMutation` predicate + Pro short-circuit + rank query
stay a single implementation. Depth: callers learn one small interface ("is this
space over cap?" / "throw if not writable"), the collation trap and Pro
short-circuit stay hidden behind it — locality for the B-24 invariants.

**No EF migration — confirmed.** This change is DTO/handler/controller-only: no
entity field, no `TidansuDbContext` model change, no index. (`SpaceReadDto` is an
Application-layer projection; `IsOverCap` is computed, never stored.)

---

## 1. 📋 Technical Tasks

### Backend — Domain

*(No Domain changes. `PlanPolicy.CheckSpaceContentMutation` and
`ISpacesRepository.CountSpacesOrderedBeforeAsync` are reused as-is — FR-3's "one
rule" constraint means specifically NOT adding anything here.)*

### Backend — Application

- [x] add `SpaceReadDto` in `src/Tidansu.Application/Spaces/Dtos/SpaceReadDto.cs`
      (mirror the shape/comment style of `SpaceSummaryDto.cs`: same 9 scalar fields as
      `SpaceDto` + `List<ZoneDto> Zones` + `List<ItemDto> Items` + `bool IsOverCap`,
      and a static `FromEntity(Space s, bool isOverCap)` whose body is today's
      `SpaceDto.FromEntity` plus the flag. Carry over the B-25-style doc comment: the
      flag is computed with the SAME `PlanPolicy.CheckSpaceContentMutation` predicate
      `SpaceOverCapGuard` enforces with — the SPA must badge from it, never derive
      over-cap client-side.)
- [x] modify `SpaceOverCapGuard` in `src/Tidansu.Application/Spaces/SpaceOverCapGuard.cs`
      `[refactor]` — deepen into the single over-cap oracle: add
      `public Task<bool> IsSpaceOverCapAsync(string spaceId, string userId, CancellationToken)`
      and extract a private `Task<string?> OverCapReasonAsync(...)` holding today's
      body (user lookup → Pro short-circuit via `PlanCaps.For(user.Plan).Spaces is not int`
      → `CountSpacesOrderedBeforeAsync` → `CheckSpaceContentMutation`);
      `EnsureSpaceContentWritableAsync` becomes "throw `PlanLimitException(reason)` if
      not null", `IsSpaceOverCapAsync` becomes "`reason is not null`". Update the class
      doc: B-26 makes `GetSpaceQueryHandler` the fourth consumer, via this class, and
      the existence-oracle caveat ("callers MUST have already owner-scoped-resolved
      spaceId") now applies to the read caller too.
      ⚠️ keep the Pro short-circuit *inside* the shared private path — Pro must never
      run a rank query, on reads either.
- [x] modify `GetSpaceQuery` in
      `src/Tidansu.Application/Spaces/Queries/GetSpace/GetSpaceQuery.cs` —
      `IRequest<SpaceDto>` → `IRequest<SpaceReadDto>`.
- [x] modify `GetSpaceQueryHandler` in
      `src/Tidansu.Application/Spaces/Queries/GetSpace/GetSpaceQueryHandler.cs` —
      inject `SpaceOverCapGuard` (already DI-registered in
      `Application/Extensions/ServiceCollectionExtensions.cs`), and after the existing
      owner-scoped `GetLayoutByIdAsync` → `NotFoundException` check, compute
      `var isOverCap = await overCapGuard.IsSpaceOverCapAsync(request.Id, userId, ct);`
      then `return SpaceReadDto.FromEntity(space, isOverCap);`.
      ⚠️ order is load-bearing: the 404 MUST stay before the guard call (S-1 —
      never rank-query a space the caller doesn't own; the guard's own doc forbids it).
- [x] modify `SpaceDto` in `src/Tidansu.Application/Spaces/Dtos/SpaceDto.cs` —
      delete `FromEntity` (both response call sites move to `SpaceReadDto`), keep both
      `ToEntity` overloads, and add a header comment: **request-only shape as of B-26**
      (create body); the response shape is `SpaceReadDto`; never add a server-computed
      field here (B-16/FR-2).
      🔒 blocked by: the two handler tasks below/above consuming `SpaceReadDto`
      (delete `FromEntity` last or the build breaks mid-sequence).
- [x] modify `CreateSpaceCommand` in
      `src/Tidansu.Application/Spaces/Commands/CreateSpace/CreateSpaceCommand.cs` —
      `IRequest<SpaceDto>` → `IRequest<SpaceReadDto>` (the `Space` property stays
      `SpaceDto` — that's the request body).
- [x] modify `CreateSpaceCommandHandler` in
      `src/Tidansu.Application/Spaces/Commands/CreateSpace/CreateSpaceCommandHandler.cs`
      — return `SpaceReadDto.FromEntity(entity, isOverCap: false)` with a comment
      stating *why* false is deterministic (a successful create implies
      `count <= cap` for every plan path: `CheckNewSpace` rejects an already-over-cap
      Free account, `AddWithinSpaceCapAsync` re-counts in-lock, Pro is unbounded — so
      no space, including this one, can be over cap after a successful create; no rank
      query needed).
      *(No change to `SpaceDtoValidator`, `SpaceFieldsDto`, `SpacePhotoGuard`, or
      `GetSpacesQueryHandler` — the request shape and B-25 list path are untouched.)*

### Backend — Infrastructure

*(None. `CountSpacesOrderedBeforeAsync` is reused as-is; **no EF migration** —
no entity/model change anywhere in this item.)*

### Backend — API

- [x] modify `SpacesController` in `src/Tidansu.API/Controllers/SpacesController.cs`
      — `GetSpace` and `CreateSpace`: `ProducesResponseType<ApiOperationResult<SpaceDto>>`
      → `ProducesResponseType<ApiOperationResult<SpaceReadDto>>` and the
      `Ok<ApiOperationResult<...>>` return types to match. The `[FromBody] SpaceDto space`
      parameter on `CreateSpace` is unchanged.
- [x] verify `dotnet build` green from `src/Tidansu.API` (gate before Kiota regen).

### Kiota regen

- [x] regenerate the Kiota client — `npm run build:api` from `src/Tidansu.App`
      (requires the fresh `dotnet build` above so the swagger DLL carries
      `SpaceReadDto`). Never hand-edit `src/api/apiClient/`.
      ⚠️ confirm the generated models now contain `SpaceReadDto` (with `isOverCap`)
      and that `SpaceDto` (request) survives unchanged; `GET /api/spaces/{id}` and
      `POST /api/spaces` responses now type as `SpaceReadDto`.
      🔒 blocked by: all Backend — API tasks.

### Frontend — API client / mapping

- [x] modify `toSpace` in `src/Tidansu.App/src/api/spaceMapping.ts` — parameter type
      `SpaceDto` → `SpaceReadDto` (import from `@/api/apiClient/models`), add
      `overCap: dto.isOverCap ?? false` to the returned `Space` (mirror the same line
      in `toSpaceSummary`), and update the function doc: as of B-26 the full-graph
      read DOES carry the server's over-cap truth (drop/rewrite the "carries no
      summary fields" framing where it concerns the flag). `toDtoBody` still returns
      `SpaceDto` — untouched (FR-2: the request shape never carries the flag).
      🔒 blocked by: Kiota regen.
      *(`useSpacesApi.get`/`create` need no edit — their `toSpace(res.data)` calls
      re-type automatically; `npm run build` is the check.)*

### Frontend — Composables/Stores

- [x] modify `loadSpaceContents` in `src/Tidansu.App/src/stores/useSpacesStore.ts` —
      in the `existing` branch, merge the flag onto the existing object:
      `existing.overCap = full.overCap;` next to the `zones`/`items` assignment
      (fresher point-in-time truth from the same predicate; consistent with FR-3).
      The `else` (cold-cache deep-link) branch needs no code change — `push(full)` now
      carries `overCap` via `toSpace`. Extend the B-16 M1 doc comment: B-26 makes the
      direct `GET /{id}` fetch carry the server's `IsOverCap`, so a deep-linked space
      is badged without any list fetch.
      ⚠️ merge-only contract: assign the field on the existing object — never replace
      the `Space` object (the M2 pending-ChangeSet hazard that bans `hydrate(true)`
      here). This is the same move `refreshOverCapFlags` makes.
- [x] modify the doc comment on `readonlySpaceIds` in
      `src/Tidansu.App/src/composables/useLimits.ts` — the sentence "A deep-linked
      space that was never in a loaded summaries page falls back to the server's 403 →
      `planReasonOf` → paywall path until the next list fetch" is now stale: replace
      with "the single-space read carries the same server-computed flag (B-26), so a
      deep-linked space is badged on load". Keep the `isInf` early-return untouched —
      it stays load-bearing for instant upgrades.
      *(No logic change in `useLimits` — the pushed/merged `overCap` flows through the
      existing `computed` automatically.)*

### Frontend — Components/Views

*(None. `SpaceView.vue`'s `readOnly = computed(() => limits.isSpaceReadOnly(props.id))`
and `DashboardView.vue`'s mapped rows consume the store flag already — FR-1's badge
appears with zero view changes. Do not add UI; requirements § Out of Scope.)*

### Tests

- [x] add deep-link cases to
      `src/Tidansu.App/src/stores/useSpacesStore.overCapFlags.test.ts` (or a sibling
      `useSpacesStore.deepLink.test.ts` following its mock setup — including the
      existing `vi.mock` of `useSessionStore`, which every spaces-store test file
      needs): (1) `loadSpaceContents(unknownId)` with a mocked `api.get` resolving a
      `Space` with `overCap: true` pushes it into `spaces.value` with the flag intact;
      (2) `loadSpaceContents(knownId)` merges `overCap` onto the **same object
      reference** (identity assertion, like the file's test 1) without touching
      sibling fields. Mock `api.get` in the module mock alongside `listPage`.
- [x] verify `npm test` (vitest) green — all pre-existing flush/hydrate/overCapFlags
      suites must pass unmodified (FR-4).
      *(No new Domain unit tests: no new pure Domain rule —
      `CheckSpaceContentMutation` already has its table tests in
      `tests/Tidansu.Domain.Tests`; still run `dotnet test` as the regression gate.)*

### Refactoring

- [x] `[refactor]` covered above: the `SpaceOverCapGuard` deepening (shared private
      reason path) is the only refactor this item needs — it removes the temptation
      for a fourth call site to re-assemble user-lookup + short-circuit + rank +
      predicate by hand. No other Clean Architecture / SOLID / template-purity
      violations found in the touched files.
- [x] `[docs]` after the implementation builds, append one line to
      `.claude/context/patterns.md` § Backend gotchas: the space root's read/write
      shapes are split (B-26) — `SpaceReadDto` is the sole response shape (carries
      server-computed `IsOverCap`); `SpaceDto` is the create request body only; never
      add a server-computed field to a request shape. (Deferred to post-build so the
      exemplar file actually exists when cited.)

### Verification (manual drive — `run` / `verify` skills)

- [x] `dotnet build` green; `dotnet test` green; `npm run build` (vue-tsc) green;
      `npm test` green.
- [x] **Cold-cache deep link, over-cap space (FR-1):** on a Free account downgraded
      with 3+ spaces (cap 2), copy the URL of a space the *dashboard currently badges*
      (rank ≥ 2), sign out of nothing but hard-reload the SPA directly at
      `/space/{id}` (fresh tab, list never opened). Observe: the read-only
      badge/affordance is present on first paint of the space, before ever visiting
      the dashboard. Attempt an edit (rename / add item): the UI blocks it; a forced
      request (devtools) returns 403 `{plan:["spaces"]}` and the paywall opens with
      reason `spaces`.
- [x] **Cold-cache deep link, kept space:** same account, hard-reload directly into a
      rank-0/1 space. Observe: fully editable; a rename and an item add both persist
      across reload.
- [x] **B-25 list flow unregressed (FR-4):** run the B-25 scenario — downgrade a
      multi-space account, dashboard badges exactly the excess set; edits on badged
      spaces 403, unbadged spaces save; upgrade to Pro → badges vanish instantly;
      downgrade again → badges return after the refetch settles.
- [x] **FR-2 forgery/wipe probe:** via curl/devtools, `POST /api/spaces` with a valid
      body plus `"isOverCap": true` — the create succeeds identically (unknown member
      ignored by System.Text.Json binding onto `SpaceDto`), the stored space is not
      over-cap, and no other field is blanked. Then a normal create + edit round-trip
      on the Free account behaves exactly as before (no new field on the form, same
      validation surfaces).
- [x] **Point-in-time staleness (approved decision, sanity only):** with an over-cap
      space open from a deep link, upgrade to Pro in the same session — the badge
      clears via the `isInf` early-return (session caps flip), confirming the
      single-read flag never *adds* staleness the list path didn't have.

---

## 2. 🔒 Security Considerations

- **S-1 · Existence oracle via the rank query** — 🟠 High. If the guard's
  `IsSpaceOverCapAsync` ever ran before the owner-scoped 404 in
  `GetSpaceQueryHandler`, a non-owner could distinguish "exists" from "doesn't"
  through timing or a divergent error. Mitigation is structural today
  (`GetLayoutByIdAsync ?? throw NotFoundException` precedes it) and documented on the
  guard.
  - [ ] Confirm in review that the guard call sits strictly after the
        `NotFoundException` throw, and that the guard's class doc names the read
        handler among the callers bound by the "owner-scope first" rule.
- **S-2 · Flag forgery / wipe on write (FR-2)** — 🟡 Medium. `IsOverCap` must never
  be bindable on a write. Mitigation is structural: the flag lives only on
  `SpaceReadDto`, which no endpoint accepts; `SpaceDto.ToEntity` maps no such field,
  so a sent `isOverCap` is dropped by deserialization.
  - [ ] Run the FR-2 forgery/wipe probe in the manual drive (curl `isOverCap: true`
        on create → ignored, nothing wiped).
- **S-3 · Predicate divergence (FR-3)** — 🟡 Medium. A fourth hand-rolled
  rank/predicate assembly could badge a set the guard doesn't enforce. Mitigation:
  the read handler consumes `SpaceOverCapGuard.IsSpaceOverCapAsync`, which shares one
  private path with enforcement; the only other consumer
  (`GetSpacesQueryHandler`) is unchanged.
  - [ ] Grep-check at review: no new call sites of `CountSpacesOrderedBeforeAsync` or
        `CheckSpaceContentMutation` outside `SpaceOverCapGuard` +
        `GetSpacesQueryHandler`.
- **S-4 · No new data exposure** — 🟢 Low. `IsOverCap` derives solely from the
  caller's own plan and own space set; nothing cross-tenant is revealed.
  - [ ] No action beyond S-1's ordering check.

## 3. 📈 Scalability / Correctness Considerations

- **C-1 · Per-read cost on Free** — the single-space GET gains one user PK lookup +
  one owner-scoped `COUNT(*)` (indexed range on `(UserId, Id)` semantics), Free only;
  Pro short-circuits before the rank query.
  - [ ] Keep the Pro short-circuit inside the guard's shared private path (asserted
        by the guard task) — never let the read path run a rank query for Pro.
- **C-2 · Collation parity** — the rank must come from
  `CountSpacesOrderedBeforeAsync` (SQL-side `string.Compare(...) < 0` under column
  collation), never an in-memory compare — the exact B-24 trap.
  - [ ] Reuse the guard (which reuses the repo method); add no new comparison code.
- **C-3 · Hydrate race on deep link** — on a cold reload, `App.vue`'s boot
  `hydrate()` and `SpaceView`'s `loadSpaceContents` run concurrently; whichever
  object wins in `spaces.value`, *both* sources now carry the server flag
  (`toSpaceSummary` since B-25, `toSpace` since B-26), so badge truth no longer
  depends on which settles last.
  - [ ] Covered by the cold-cache manual drive; the store test's identity assertion
        guards the merge-only half.
- **C-4 · No N+1 / payload growth** — the list path (page-index rank, B-25) is
  untouched; `SpaceReadDto` adds one boolean to a response that already ships the
  photo-less graph.
  - [ ] No action; confirm `GetSpacesQueryHandler` diff is empty at review.

## 4. 📦 New Dependencies

No new dependencies required.

## 5. ❓ Open Questions

No open questions — the two candidate blockers were resolved before planning:
staleness on single-space reads is accepted (product decision, this task's brief),
and the live mid-session downgrade flip is explicitly deferred to the sync item
(B-25 Q2 / future B-27).
