# B-18 · Technical Tasks — Loading + error/retry states for spaces hydrate (U-2)

**Path: LIGHT.** Frontend-only. No entity change, no migration, no controller/DTO/route
change, therefore **no Kiota regen**. No new plan-limit code path. Three source files
plus one test file. This is one coherent diff.

## Design frame (read before writing code)

`useSpacesStore` already owns the *identical* three-state problem one level down:
`loadSpaceContents` distinguishes **loading / failed / genuinely-empty** for a single
space's contents, and `SpaceView.vue` renders exactly those three states with a
`BaseIcon` pulse, a `BaseEmptyState` + Retry, and the real content. B-18 lifts that same
shape one level up, to the account's spaces list.

- **Seam:** the store's `hydrate` interface. Today it exposes one fact (`hydrated:
  boolean`), which conflates "never started", "in flight" and "failed" into a single
  falsy value — that conflation *is* the bug. Widen the interface by exactly two
  read-only getters (`isHydrating`, `isHydrateFailed`) and keep the whole state machine
  inside the store. `DashboardView` learns two booleans and gets the full three-state
  behaviour: depth, not a new mechanism.
- **Do not** introduce a parallel loading mechanism (no `useQuery` in the view, no new
  composable, no exposing TanStack internals). `hydrate` already routes through
  `queryClient.fetchQuery`; this task exposes state around that call, it does not
  rewrite the fetch.
- **Locality:** every "did the spaces list load?" decision lands in the store. The view
  only reads booleans.

---

## 1. 📋 Technical Tasks

### Frontend — Composables/Stores

- [x] **modify** `hydrate` into an explicit state machine in
      `src/Tidansu.App/src/stores/useSpacesStore.ts`
      — add a module-private `hydrateStatus = ref<'idle' | 'loading' | 'loaded' | 'failed'>('idle')`
      next to the existing `hydrated` ref, and expose two `computed` getters
      `isHydrating` (`=== 'loading'`) and `isHydrateFailed` (`=== 'failed'`).
      Mirror the naming and doc-comment style of the existing
      `isContentsLoading` / `isContentsLoaded` / `isContentsFailed` trio in the same file
      (they are the direct precedent — B-16/B-17). Add all three new names to the
      store's `return { ... }` block.
      Wrap the existing body of `hydrate` (from `const key = spacesQueryKey(1)` through the
      starter-fridge seed) in `try/catch`:
      - set `hydrateStatus = 'loading'` immediately after the `if (hydrated.value && !force) return;` early-out;
      - on success set `hydrated.value = true` and `hydrateStatus = 'loaded'` **before** the
        `if (total.value === 0)` seed block, exactly as `hydrated` is set today;
      - on failure `console.error('[spaces] hydrate failed', e)` (matching
        `loadSpaceContents`'s catch), set `hydrateStatus = 'failed'`, and **leave
        `hydrated.value` false** so a later `hydrate()` never short-circuits (FR-3);
      - **swallow** the error (do not rethrow) — see the ⚠️ below.
      ⚠️ **`hydrated` must not be set on the failure path.** This is FR-3's load-bearing
      line and the difference between "Retry works" and "Retry silently no-ops". The
      `hydrated = true` assignment must live *inside* the `try`, after the awaited fetch.
      ⚠️ **Do not add a "hydrate already in flight" early-return.** `useAuth.consume`
      does `await spaces.hydrate(true)` and relies on the await meaning "spaces are
      loaded"; an early-return would resolve instantly and navigate to a still-empty
      dashboard. If concurrency protection is ever wanted it must *return the in-flight
      promise*, not return early.
      ⚠️ **Correction (review M1, fixed post-review):** the original premise here — "the
      two callers cannot overlap" — is **false**. An already-signed-in user (tokens in
      storage) who opens a fresh magic link full-page-loads `/login?token=…`, so
      `App.vue`'s `void spaces.hydrate()` and `useAuth.consume`'s
      `await spaces.hydrate(true)` both run while `hydrated` is still `false`. This was
      fixed with an epoch counter (see `useSpacesStore.ts`'s `hydrateEpoch`): each call
      captures the epoch current at its start and only writes `hydrateStatus`/`hydrated`/
      `spaces` if that epoch is still current when its fetch resolves; `reset()` bumps the
      epoch so an in-flight call can't re-arm state after sign-out. This is **not** the
      in-flight early-return ruled out above — every call still runs its own fetch and
      its `await` still resolves normally; only the *losing* call's post-await writes are
      suppressed.

- [x] **modify** `reset()` in `src/Tidansu.App/src/stores/useSpacesStore.ts` to also set
      `hydrateStatus = 'idle'`, alongside the existing `hydrated.value = false`.
      (Sign-out must not leave a stale error panel armed for the next user.)
      🔒 blocked by: the `hydrate` state-machine task

- [x] **verify (no code change expected)** the swallow's two downstream effects in
      `src/Tidansu.App/src/composables/useAuth.ts` and
      `src/Tidansu.App/src/views/auth/LoginView.vue`.
      Because `hydrate` no longer rejects, `useAuth.consume`'s `await spaces.hydrate(true)`
      resolves even when the spaces fetch fails. That is **deliberate and a strict
      improvement**: today `LoginView.consumeToken`'s bare `catch` turns *any* hydrate
      failure into `'That sign-in link is invalid or has expired. Request a new one.'`
      — a misleading message for a user whose tokens were in fact set. After this change
      sign-in completes and the dashboard shows the real error panel + Retry (FR-2/FR-4).
      Second effect: `App.vue`'s `void spaces.hydrate()` no longer produces an unhandled
      promise rejection on a failed boot fetch. Record both in the store's `hydrate`
      JSDoc so the next reader doesn't "fix" the swallow.

### Frontend — Components/Views

- [x] **modify** `src/Tidansu.App/src/views/DashboardView.vue` to render four mutually
      exclusive content states, copying `SpaceView.vue`'s block shapes verbatim
      (lines ~18–47 there: the `animate-pulse` `BaseIcon` loading block, then the
      `BaseEmptyState` failed block with a `size="sm"` Retry `BaseButton`).
      In `<script setup>` add four **plain boolean `computed`s** — no expressions in the
      template (template-purity HARD RULE):
      - `isLoadingSpaces` → `store.isHydrating`
      - `loadFailed` → `store.isHydrateFailed`
      - `showEmptyState` → `store.hydrated && store.count === 0`  *(replaces the current
        `v-if="store.count === 0"`, which is the actual bug — it can't tell pending or
        failed from genuinely empty)*
      - `showGrid` → the remaining case
      Template order: loading `v-if` → failed `v-else-if` → empty `v-else-if` → grid
      `v-else`. The `<!-- Load more -->` block stays gated on `store.hasMoreSpaces` as
      today (it is falsy while `total` is 0, so it needs no extra gate).
      ⚠️ **Template purity:** bind `v-if="isLoadingSpaces"` etc. — never
      `v-if="state === 'loading'"`, never `:disabled="!canCreate"`. Comparisons, `!`,
      ternaries and lookups all belong in `computed`. Colours come from `@theme` tokens
      only (`text-text-2`, `border-border`, `bg-surface`) — copy SpaceView's classes,
      write no hex, no dynamic class strings.
      ⚠️ The header (`Your spaces`, `UsageMeter`, `New space`) and the at-limit banner
      stay **outside** the state chain — FR-2/FR-5 require the shell to remain visible
      and nav usable in every state.
      ⚠️ The `'idle'` case (auth-disabled dev bypass / no tokens, where `App.vue` never
      calls `hydrate`) falls into `showGrid` with zero cards + the dashed new-space tile.
      That is intentional: it keeps the `VITE_DISABLE_AUTH=true` workflow usable and
      still never fires the seed. Do not fold `'idle'` into the loading state or that
      workflow renders a permanent spinner.
      🔒 blocked by: the `hydrate` state-machine task

- [x] **add** the error-panel copy to the failed block in
      `src/Tidansu.App/src/views/DashboardView.vue`, matching `SpaceView.vue`'s existing
      sentence pattern (approved: reuse the existing "Couldn't load…" wording, do not
      invent new phrasing):
      `icon="restart"`, `title="Couldn't load your spaces"`,
      `description="Something went wrong loading them. Check your connection and try again."`
      Retry action: `<BaseButton size="sm" @click="onRetry">Retry</BaseButton>`.
      Add the named handler `function onRetry() { void store.hydrate(true); }` — mirroring
      `SpaceView.onRetry`.
      ⚠️ Retry must pass `force = true`. The non-forced path goes through
      `queryClient.fetchQuery`, whose 30s `staleTime` / `retry: 1` defaults make a
      re-attempt non-deterministic; `force` calls `api.listPage` directly and then
      `setQueryData`, which is what "Retry always re-attempts the real fetch" (FR-3/FR-4)
      requires. It also re-enters the `'loading'` state, so the panel is replaced by the
      spinner while in flight.
      🔒 blocked by: the DashboardView state-chain task

- [x] **add** a UI availability guard on "New space" in
      `src/Tidansu.App/src/views/DashboardView.vue` (approved decision (b)).
      Add `const isCreateDisabled = computed(() => isLoadingSpaces.value || loadFailed.value);`
      bind `:disabled="isCreateDisabled"` on the header `BaseButton` (it already supports
      `disabled` with `disabled:opacity-50 disabled:cursor-not-allowed`), and add a
      first-line backstop in `goCreate`: `if (isCreateDisabled.value) return;` — mirroring
      the existing B-17 backstop in `onRename`.
      *Why:* creating a space while `store.count` is unknown would run the Free 2-space
      cap check against unknown state.
      ⚠️ **This is a UI availability guard only — not a plan-limit path.** Leave
      `limits.guard(limits.checkAddSpace())` in `goCreate` and `onDuplicate` exactly as it
      is; it stays the single cap enforcement. Do not duplicate, reorder or weaken it, and
      do not open the paywall from this guard.
      ⚠️ The dashed new-space tile inside the grid needs no guard — it only renders in the
      grid branch, which is unreachable while loading or failed.
      🔒 blocked by: the DashboardView state-chain task

### Verification

- [x] **create** `src/Tidansu.App/src/stores/useSpacesStore.hydrate.test.ts` — mirror the
      mock setup at the top of the existing `useSpacesStore.flush.test.ts` (same
      `vi.mock` of `@/composables/useApiClient`, `useSpacesApi`, `useLimits`, `@/queryClient`;
      same `setActivePinia(createPinia())` in `beforeEach`). Four cases, all driving the
      store directly:
      1. rejected `listPage` → `isHydrateFailed === true`, `hydrated === false`,
         `api.create` **never called** (no phantom starter fridge) and `spaces` still empty;
      2. rejected then `hydrate(true)` succeeding with one space → `isHydrateFailed === false`,
         `hydrated === true`, grid data present (FR-4);
      3. successful `listPage` returning `total: 0` → seed still fires exactly as today
         (`api.create` called once) — the no-regression guard on FR-3;
      4. `hydrate()` after a failure is **not** short-circuited by the `hydrated` flag
         (`listPage` called a second time).
      *Why a test here:* FR-3 is data-integrity shaped (a phantom space created after a
      network blip) and depends on a rejection interleaving that is unreliable to drive by
      hand — the same rationale that produced `useSpacesStore.flush.test.ts`.
      🔒 blocked by: the `hydrate` state-machine task

- [x] **run** `npm test` from `src/Tidansu.App` — the new hydrate suite and the existing
      `useSpacesStore.flush.test.ts` both green.

- [x] **run** `npm run build` from `src/Tidansu.App` — `vue-tsc` type-check green.
      (No `dotnet build` and no `npm run build:api` needed: nothing backend changed.)

- [x] **drive** the flow in the running app (`run` / `verify` skill; `dotnet run` from
      `src/Tidansu.API` + `npm run dev`), signed in with at least one real space:
      1. *Happy path (FR-1):* throttle the network (DevTools → Slow 3G) and reload the
         dashboard. Observe the pulsing cabinet icon + "Loading…", then the card grid.
         **"No spaces yet" must never appear**, not even for a frame.
      2. *Failed path (FR-2/FR-3):* DevTools → Network → Offline (or block
         `GET /api/spaces`), reload. Observe the "Couldn't load your spaces" panel with a
         Retry button; **no** "No spaces yet" panel; **no** new space appears; confirm in
         the Network tab that no `POST /api/spaces` fired.
      3. *"New space" guard (FR-5):* in both the loading and failed states, the header
         "New space" button is visibly disabled and un-clickable, while the nav/header
         still navigate (click Pricing, come back).
      4. *Retry (FR-4):* still offline, click Retry → spinner, then the error panel again.
         Go back online, click Retry → the real card grid, with the "New space" button
         re-enabled.
      5. *Genuine empty (no regression):* sign in as a fresh account → "No spaces yet"
         and the starter fridge seed fire exactly as before.
      6. *Sign-in path:* trigger a failing spaces fetch during magic-link consume →
         sign-in now **completes** and lands on the dashboard error panel, instead of the
         misleading "That sign-in link is invalid or has expired."

### Refactoring

- [x] `[refactor]` **modify** `src/Tidansu.App/src/views/DashboardView.vue` — while adding
      the state chain, keep the four state booleans as the *only* new template-visible
      surface and leave `subtitle`, `atSpaceLimit`, `spaceCards`, `newTileIcon`,
      `newTileTitle`, `newTileDesc` untouched. They are already correct template-pure
      computeds. Scope: touched files only; no other refactors identified in
      `useSpacesStore.ts` (its `hydrate` gains a `try/catch` and nothing else moves).

---

## 2. 🔒 Security Considerations

- **Expired/invalid token indistinguishable from an empty account.** A 401 on
  `GET /api/spaces` currently renders as "you have no spaces" and can seed a space into
  whichever account the retry eventually authenticates as. After this change a 401 lands
  in the failed state with no mutation. 🟠 High
  - [x] Confirm in the manual drive (step 2) that a 401 response — not just an offline
        error — produces the error panel and fires **no** `POST /api/spaces`.
- **Error copy must stay non-technical.** The panel must not surface the server message,
  status code or stack — reuse `SpaceView`'s generic wording. 🟢 Low
  - [x] `BaseEmptyState`'s `description` is a hardcoded string; the caught error goes only
        to `console.error`, never to the DOM.

## 3. 📈 Scalability / Correctness Considerations

- **Phantom starter-fridge write after a transient failure.** The pre-existing bug: a
  failed hydrate leaves `total === 0`, and the seed block would fire on any path that
  reaches it with a falsy state. 🔴 (the core defect this task fixes)
  - [x] The seed block stays *inside* the `try`, after `hydrateStatus = 'loaded'`, so it is
        unreachable on the failure path — covered by unit-test case 1.
- **Retry storms.** Manual Retry only; no backoff, no auto-retry, no offline polling
  (explicitly out of scope). Each click is one `api.listPage` call.
  - [x] Confirm Retry is only rendered in the failed state, so it cannot be clicked while
        a fetch is in flight.
- **TanStack `retry: 1` default doubles perceived latency on the non-forced boot path.**
  A failed boot hydrate makes two requests before the panel appears. Acceptable for this
  slice; the forced Retry path bypasses it entirely.
  - [x] No change; note it so the observed double request during the manual drive isn't
        mistaken for a bug.
- **Stale error after sign-out.** Covered by the `reset()` task.
  - [x] `reset()` sets `hydrateStatus = 'idle'`.

## 4. 📦 New Dependencies

No new dependencies required.

## 5. ❓ Open Questions

1. **Error-panel copy — one adapted word.** The approved instruction is to reuse
   `SpaceView`'s wording verbatim, but its literal text is *"Couldn't load this space" /
   "Something went wrong loading its contents…"*, whose noun is wrong at the account
   level. Planned: *"Couldn't load your spaces" / "Something went wrong loading them.
   Check your connection and try again."* — identical sentence pattern, corrected noun.
   Flagging rather than assuming; low risk, not a blocker.
2. **B-19 serialization.** B-19 (surface non-plan space-sync failures) touches the same
   store and the same `console.error` failure paths. If B-19 is in flight, land B-18
   first — this task only adds a `try/catch` around `hydrate`, whereas B-19 restructures
   `handleSyncError`. Confirm B-19 is not concurrently assigned before starting.
</content>
