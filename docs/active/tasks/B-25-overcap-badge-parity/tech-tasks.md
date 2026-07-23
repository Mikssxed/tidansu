# B-25 · Tech tasks — over-cap badge parity via server-sent truth (v2)

**Stage-2 gate decision:** the client-side collation-comparator plan (v1) is
**dropped**. The server now includes its authoritative over-cap determination in
the space-summary list response (`IsOverCap` per summary), and the SPA badges
from that flag. This is the full path: Application → API contract → Kiota regen
→ SPA. No client code may ever attempt to reproduce the server's `OrderBy(Id)`
collation order — that whole problem class disappears with this design.

**One-code-path guarantee (why the flag can't disagree with enforcement).**
B-24's enforcement is `SpaceOverCapGuard.EnsureSpaceContentWritableAsync`
(`src/Tidansu.Application/Spaces/SpaceOverCapGuard.cs`): rank from
`ISpacesRepository.CountSpacesOrderedBeforeAsync` (SQL `WHERE Id < @id` under
column collation) fed into the pure predicate
`PlanPolicy.CheckSpaceContentMutation(plan, rank)`
(`src/Tidansu.Domain/Constants/PlanPolicy.cs`). The list flag reuses **the same
predicate** with rank = `skip + rowIndex` of `GetSpaceSummariesPageAsync`'s own
`OrderBy(s => s.Id)` query — and the equivalence of those two rank sources is
already a documented, load-bearing invariant (the B-24 comment on
`CountSpacesOrderedBeforeAsync` in
`src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs` exists precisely
to pin the count query to the paging query's collation order). So the policy is
defined once (`PlanPolicy`), the ordering is defined once (the collated Id
order), and the flag is computed from the same page query the client renders —
no third definition anywhere.

**FR-3 staleness model (the caveat from v1, now handled head-on).** The flag is
server-computed at fetch time, so each event that changes the true set gets an
explicit freshness mechanism:

| Event | Mechanism | Latency |
|---|---|---|
| Initial load / reload / Load-more | Flags arrive with the summaries (`hydrate` / `loadMoreSpaces`) | none |
| **Upgrade to Pro** | Locally derived: `useLimits` keeps its `isInf(cap)` early-return, so the badge set is empty the instant `session.caps` flips — stale `overCap:true` flags are structurally invisible on Pro | instant |
| **Downgrade to Free** | `useSpacesStore` watches `session.plan` and runs `refreshOverCapFlags()` — a **merge-only** summaries refetch (flags + total by id into *existing* `Space` objects; never replaces objects, so the `hydrate(true)` hazard — the M2 note on `handleCreateError`: pending `ChangeSet`s staged against replaced objects — cannot occur) | one round-trip (~100ms); transient state errs to *fewer* badges, and the server 403 → existing `planReasonOf` → paywall path is the backstop for a click inside the window |
| **Space delete** (the recovery path back under cap) | `deleteRemote`'s success path triggers the same `refreshOverCapFlags()` when the plan's space cap is finite; until it lands, flags err to *over*-badging (UI blocks something the server would now allow — the safe direction) | one round-trip |
| **Space add** | Unreachable while any badge exists (Free over cap blocks creates on both sides — `checkAddSpace` + the server cap gate), so session-created spaces default `overCap: false` (Pro) and the downgrade refetch covers them later. This closes v1's unsolvable "unknown rank for session-created spaces" hole — the refetch *is* the answer | n/a |
| **Webhook downgrade at period end** (scheduled cancel) | The client's `session.plan` flips whenever the SPA next learns of it (next `AuthResponse`/sign-in) — the same plan watch fires then | same as downgrade |

Known accepted edge: a deep-linked/refresh-loaded space that was never in a
loaded summaries page (`loadSpaceContents`'s `spaces.value.push(full)` — the
full-graph `SpaceDto` carries no flag) shows unbadged until a list fetch;
the 403 backstop covers it. Widening `SpaceDto` too is deliberately out of
scope — it doubles as the create/update *request* body (see the shared-DTO wipe
trap from B-16) — flagged in Open Questions.

---

## 📋 Technical Tasks

No Domain entity or `TidansuDbContext` model change → **no EF migration**.
`SpaceSummary` (Domain projection record) and the repository are untouched —
rank comes free from the page query's `skip + index`.

### Backend — Application

- [x] T-1 · modify `src/Tidansu.Application/Spaces/Dtos/SpaceSummaryDto.cs` —
  add `public bool IsOverCap { get; set; }` and extend
  `FromSummary(SpaceSummary s)` to `FromSummary(SpaceSummary s, bool isOverCap)`
  (compile error at the single call site guarantees the handler passes it).
  Doc-comment the field: *server-authoritative "this whole space is one of the
  account's excess spaces and is read-only" — computed with the same
  `PlanPolicy.CheckSpaceContentMutation` predicate `SpaceOverCapGuard` enforces
  with; the SPA must badge from this and never derive over-cap from position or
  id order (B-25).*

- [x] T-2 · modify `src/Tidansu.Application/Spaces/Queries/GetSpaces/GetSpacesQueryHandler.cs` —
  inject `IUserService` (mirror `SpaceOverCapGuard`'s ctor + its
  `FindByIdAsync ?? throw new AuthenticationException("user not found")`
  resolution shape), then map with the account-wide rank:
  ```csharp
  Items = [.. summaries.Select((s, i) => SpaceSummaryDto.FromSummary(
      s, PlanPolicy.CheckSpaceContentMutation(user.Plan, skip + i) is not null))],
  ```
  (`skip + i` is the summary's 0-based rank in the account's `OrderBy(Id)` order
  because the page query orders and skips by exactly that key — say so in a
  comment, citing the B-24 `CountSpacesOrderedBeforeAsync` comment.)
  🔒 blocked by: T-1
  ⚠️ Watch-out: do **not** compute the flag by calling
  `CountSpacesOrderedBeforeAsync` per row — that's an N+1 over the page and a
  second rank source. The index of the already-ordered page is the rank.
  ⚠️ Watch-out: keep the flag computation out of the repository — plan/policy is
  Application/Domain, the repo stays a pure projection (layer discipline).

- [x] T-3 · modify the class doc comment on
  `src/Tidansu.Application/Spaces/SpaceOverCapGuard.cs` — append: the GET
  /api/spaces list flag (`SpaceSummaryDto.IsOverCap`, `GetSpacesQueryHandler`)
  shares `PlanPolicy.CheckSpaceContentMutation`; any change to the over-cap rule
  must go through that predicate so enforcement and the advertised flag cannot
  diverge. (Comment-only.)

### Backend — API

No controller change — `SpacesController`'s list action returns
`PagedResult<SpaceSummaryDto>` and the new property flows through the existing
action signature. The **contract** still changes (new response field), hence:

### Kiota regeneration

- [x] T-4 · regenerate the Kiota client: `dotnet build` from `src/Tidansu.API`
  (fresh swagger DLL), then `npm run build:api` from `src/Tidansu.App`.
  🔒 blocked by: T-1, T-2
  ⚠️ Watch-out: never hand-edit `src/Tidansu.App/src/api/apiClient/` (hook
  blocks it); the generated `SpaceSummaryDto` gains `isOverCap?: boolean`.

### Frontend — API client

- [x] T-5 · modify `src/Tidansu.App/src/data/types.ts` — add
  `overCap?: boolean` to the `Space` interface (optional: locally built spaces
  — onboarding/duplicate/seed — legitimately omit it; absent ⇒ not over-cap.
  Doc-comment: server-sent truth from the summaries list, never derived
  client-side).

- [x] T-6 · modify `toSpaceSummary` in `src/Tidansu.App/src/api/spaceMapping.ts`
  — map `overCap: dto.isOverCap ?? false`. (`toSpace` — the full-graph mapping —
  deliberately does *not* set it: preserved on existing objects by
  `loadSpaceContents`'s field-wise merge, and the deep-link push edge is the
  documented backstop case.)
  🔒 blocked by: T-4, T-5

### Frontend — Composables/Stores

- [x] T-7 · add `refreshOverCapFlags()` to
  `src/Tidansu.App/src/stores/useSpacesStore.ts` — **merge-only** freshness
  action: early-return unless `hydrated.value` (and skip while
  `hydrateStatus === 'loading'` — hydrate is about to deliver fresh flags
  anyway); loop pages `1..loadedPage` via `api.listPage(page, PAGE_SIZE)`; for
  each returned summary, find the existing space by id and set only
  `space.overCap` (plus `total.value` from the response). Never push, remove, or
  replace `Space` objects — the whole point versus `hydrate(true)` (cite the M2
  note). Swallow-and-log errors (`console.error('[spaces] over-cap refresh
  failed', e)`) — a failed refresh leaves the previous flags, and the 403
  backstop still holds; no `raiseSaveMessage` (nothing the user changed failed
  to save).
  🔒 blocked by: T-6

- [x] T-8 · wire the FR-3 triggers in
  `src/Tidansu.App/src/stores/useSpacesStore.ts`:
  - store setup: `const session = useSessionStore();` +
    `watch(() => session.plan, () => { void refreshOverCapFlags(); })`
    (store-in-store is standard Pinia; `useSessionStore` does not import this
    store, so no cycle);
  - `deleteRemote`: on the DELETE's success path call `refreshOverCapFlags()`
    when `!isInf(session.caps.spaces)` (a deleted space can pull a badged
    sibling back under cap; skip the wasted request on Pro) — i.e.
    `void api.remove(id).then(onDeleted).catch(handleDeleteError)` with a named
    `onDeleted` helper.
  🔒 blocked by: T-7
  ⚠️ Watch-out: do not "optimize" the plan watch behind an over-cap-only
  condition — the *downgrade* transition is exactly when current flags are all
  `false` (fetched under Pro) and the refetch is what discovers the badge set.

- [x] T-9 · modify `readonlySpaceIds` in
  `src/Tidansu.App/src/composables/useLimits.ts` — badge from the server flag:
  ```ts
  const readonlySpaceIds = computed<Set<string>>(() => {
      if (isInf(session.caps.spaces)) return new Set();
      return new Set(spaces.spaces.filter((s) => s.overCap).map((s) => s.id));
  });
  ```
  The `isInf` early-return stays load-bearing: it is what makes *upgrade*
  instant (FR-3) and makes stale `overCap:true` flags structurally invisible on
  Pro. Still a plain `computed` over `session.caps` + `spaces.spaces` — no
  snapshot, no watcher here.
  🔒 blocked by: T-5 (field exists) — functionally complete after T-7/T-8.

- [x] T-10 · rewrite the stale "⚠️ Determinism (the crux of B-17)" doc block
  above `readonlySpaceIds` in `src/Tidansu.App/src/composables/useLimits.ts` —
  it currently claims store order mirrors the server's `OrderBy(Id)` and
  commands "never re-sort" — false since B-23 (`reconcileSpaceId` swaps in a
  random server id without repositioning; `duplicateSpace` splices mid-array),
  and it describes the exact positional scheme this task removes. Replace with:
  the badge is the server's `IsOverCap` truth (one predicate with enforcement —
  cite `SpaceOverCapGuard`/T-3); freshness contract per event (the FR-3 table:
  isInf for upgrade, plan-watch + delete-hook refetch in `useSpacesStore`);
  never derive over-cap from array position, id sorting, or `localeCompare`;
  deep-link-only edge falls back to the server 403 → paywall.
  🔒 blocked by: T-9

- [x] T-11 · modify `duplicateSpace` in
  `src/Tidansu.App/src/stores/useSpacesStore.ts` — in the `copy` literal, force
  `overCap: false` (the `...orig` spread would otherwise clone a stale flag onto
  a brand-new space; a create can never be over-cap at birth because creates are
  cap-gated).
  🔒 blocked by: T-5

- [x] T-12 · create `src/Tidansu.App/src/stores/useSpacesStore.overCapFlags.test.ts`
  — vitest, mirroring `useSpacesStore.hydrate.test.ts`'s module-mock setup
  (mock `useSpacesApi`/`queryClient`; this is a data-integrity case per the
  test-surface rule, not manual-drive material):
  1. `refreshOverCapFlags` sets `overCap` by id on the **same object references**
     (assert reference equality and that `zones`/`items` set beforehand survive
     — the merge-not-replace contract);
  2. plan flip (mutate the mocked session store's plan) triggers exactly one
     refetch of the loaded pages;
  3. delete success triggers a refresh when the cap is finite and skips it on
     Pro;
  4. not hydrated ⇒ no request.
  🔒 blocked by: T-7, T-8

### Frontend — Components/Views

No changes. `DashboardView.vue` (fully-mapped card array with per-card
`readOnly`) and `SpaceView.vue` (`limits.isSpaceReadOnly(props.id)`) consume
the corrected set through the unchanged `useLimits` interface.

### Refactoring

No refactoring needed in touched files beyond T-10's stale-comment rewrite
(which is a correctness task, not a cleanup). `GetSpacesQueryHandler` stays a
thin query handler; the second `FindByIdAsync` PK read matches the
already-accepted B-24 trade-off documented on `SpaceOverCapGuard`.

### Verification

- [x] V-1 · `dotnet build` green (solution) and `dotnet test` green from
  `tests/Tidansu.Domain.Tests` (no new Domain rule — `CheckSpaceContentMutation`
  is reused, its existing tests still pin the predicate).
- [x] V-2 · `npm test` green and `npm run build` (vue-tsc) green from
  `src/Tidansu.App`.
- [x] V-3 · manual end-to-end drive (the `run` skill) — the transition scenario
  that killed the positional scheme, now including the refetch seams:
  1. Sign in as Pro; create 3+ spaces **via onboarding** and duplicate one
     (array order ≠ Id order is the precondition under test). Confirm no badges.
  2. Downgrade to Free (cap 2) via the account page. **Observe**: within one
     round-trip, exactly `total − 2` spaces badge read-only — generally NOT the
     last cards on the dashboard — and the dashboard display order is unchanged
     (FR-2).
  3. **Click**: attempt rename/edit/add on every space — badged spaces are
     blocked in-UI and a forced request 403s `{plan:["spaces"]}` → paywall;
     every unbadged space saves. Badged set ≡ 403 set is the acceptance bar
     (FR-1).
  4. Delete one badged space → after the delete's refresh lands, the badge count
     drops (a previously badged space may unfreeze — verify by editing it).
     Upgrade to Pro → badges clear **instantly** (isInf path, no request race).
     Downgrade again → same set returns (FR-3). No page reload at any step.
  5. Reload while downgraded: badge set identical straight from hydrate.

---

## 🔒 Security Considerations

- 🟢 **Server stays sole enforcement authority.** `IsOverCap` is advisory UI
  truth; every mutation still passes `SpaceOverCapGuard`. A tampered/stale flag
  changes pixels, not authorization.
  - [x] Mitigated by design — no action.
- 🟢 **No new information exposure.** The flag is computed inside the
  owner-scoped list query about the caller's own spaces/plan; the guard's
  existence-oracle caveat (403 before 404) doesn't apply to a list the caller
  already owns.
  - [x] No action.
- 🟡 **Predicate drift.** If a future change edits the guard's rule but not the
  flag (or vice versa), UI and enforcement silently disagree again — the exact
  bug class B-25 fixes.
  - [ ] Mitigation: T-1/T-3/T-10 comments pin both sides to
    `PlanPolicy.CheckSpaceContentMutation` as the single rule; any new over-cap
    logic must route through it.

## 📈 Scalability / Correctness Considerations

- **No N+1 in the list handler** — the rank is the page index; the only added
  cost is one `FindByIdAsync` PK read per list request (same trade already
  accepted for `SpaceOverCapGuard`, see its doc comment).
  - [x] Enforced by T-2's watch-out.
- **`refreshOverCapFlags` refetch fan-out** — re-requests pages `1..loadedPage`
  on downgrade/delete. At 20/page this is 1 request for typical accounts; a
  power user with many loaded pages pays a few sequential summary requests
  (summaries are the slim B-16 projection — no zones/items/photos).
  - [ ] Mitigation: acceptable as specced; if it ever matters, a dedicated
    flags-only endpoint is the escalation (new contract — out of scope).
- **Merge-only invariant** — the refresh must never replace `Space` objects or
  the array, or it recreates the M2 pending-`ChangeSet` data-loss hazard that
  bans `hydrate(true)`.
  - [ ] Mitigation: T-7's contract + T-12 test 1 (reference-equality assertion).
- **Transient windows are directionally safe** — downgrade under-badges briefly
  (403 backstop), delete over-badges briefly (UI stricter than server); neither
  can cause a lost write or a silent success.
  - [x] Documented in T-10's comment; exercised by V-3 steps 2/4.

## 📦 New Dependencies

No new dependencies required.

## ❓ Open Questions

1. **Should `GET /api/spaces/{id}` also report over-cap?** The full-graph
   `SpaceDto` deliberately doesn't get the flag here because it doubles as the
   create/update request body (shared-DTO trap, B-16) — so a deep-link/refresh
   straight into an over-cap space (list never loaded) renders unbadged until a
   mutation 403s. If product wants that edge badged proactively, the right shape
   is a separate read-only response field or a split read DTO — worth a
   `design-an-interface` pass from the main session, not a bolt-on here.
2. **Sync (Pro, future):** when cross-device sync lands, another device's space
   create/delete changes the over-cap set with no local trigger. The plan-watch/
   delete-hook freshness model will need a sync-driven refresh trigger — note
   for whoever builds the sync feature, no action now.
