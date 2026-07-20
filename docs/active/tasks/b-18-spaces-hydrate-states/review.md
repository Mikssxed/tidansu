# Code Review: B-18 · spaces-hydrate-states (uncommitted on `main`)
**Date**: 2026-07-20
**Reviewer**: branch-code-reviewer agent
**Diff base**: working tree vs `HEAD` (a21ae34) — B-18 is not yet committed
**Files changed**: 3 source (`useSpacesStore.ts`, `DashboardView.vue`, new `useSpacesStore.hydrate.test.ts`) + task docs / agent memory / `.claude/context/patterns.md`

## Summary
A tight, well-scoped LIGHT-path change that does what `tech-tasks.md` approved and
nothing more. **The core defect is genuinely closed**: `hydrated` is assigned only
inside the `try`, after the awaited fetch, and the starter-fridge seed sits below
that assignment inside the same `try`, so no failure path can reach it — verified by
reading every `seedFridge` call site and by mutation-reasoning the new tests. One
real concurrency gap remains (M1): the plan's premise that the two `hydrate` callers
can never overlap is false for an already-signed-in user opening a magic link, and
the new single `hydrateStatus` ref is last-writer-wins.

**Update (2026-07-20):** M1, N1 and N2 are fixed in a follow-up pass — see the
[Resolution](#resolution-2026-07-20-follow-up) section below for what changed and how
it was verified.

**Verification run by this review:** `npx vitest run` over the hydrate + flush suites
— 12/12 green; `npx vue-tsc --noEmit -p tsconfig.app.json` — clean.

## Resolution (2026-07-20 follow-up)
All three accepted findings (M1, N1, N2) are fixed. N3 (`role="status"`) remains
explicitly out of scope, matching the pre-existing `SpaceView.vue` gap.

- **[M1] Fixed.** `useSpacesStore.ts` gained a module-scoped `hydrateEpoch` counter.
  Each `hydrate()` call captures `const epoch = ++hydrateEpoch` at its start; after the
  `await`, `if (epoch !== hydrateEpoch) return;` gates every subsequent write
  (`spaces`/`total`/`loadedPage`/`hydrated`/`hydrateStatus`/the seed) so a superseded
  call can never overwrite a winner's state. The `catch` re-checks
  `epoch === hydrateEpoch` before writing `'failed'`. `reset()` now also does
  `hydrateEpoch++`, orphaning any in-flight call so it can't re-arm status after
  sign-out. The in-flight early-return remains deliberately absent — every call still
  runs its own fetch and its `await` still resolves normally; only the losing call's
  post-await writes are suppressed. `tech-tasks.md`'s "the two callers cannot overlap"
  claim is corrected in place.
  Verified: a new `describe('M1: overlapping hydrate() calls...')` block in
  `useSpacesStore.hydrate.test.ts` drives (a) a losing failure settling after a winning
  success — asserts the winner's `hydrated`/`spaces`/`isHydrateFailed` survive — and
  (b) `reset()` mid-flight, both for a still-pending success and a still-pending
  failure — asserts neither re-arms `hydrateStatus`/`hydrated` afterward. Mutation-
  checked: reverting the epoch guard (temporarily, then restored) reddened exactly
  those 3 new tests and no others. Also driven live against the running app (headless
  Edge over CDP, magic-link sign-in + a forced 401 on `GET /api/spaces` + Retry) —
  the failed panel, disabled "New space", and successful Retry recovery all still
  render correctly post-refactor.
- **[N1] Fixed.** Added a deferred-promise test asserting `isHydrating === true` while
  the fetch is in flight and `false` once it settles (FR-1), plus a `reset()` →
  `isHydrateFailed === false` assertion after a prior failure. Verified non-tautological:
  temporarily deleting `hydrateStatus.value = 'loading'` reddens exactly the new
  loading-transition test and no others.
- **[N2] Fixed.** `DashboardView.vue`'s card-grid branch is now a plain `v-else`
  (the negation-duplicating `showGrid` computed removed); the four states
  (loading → failed → empty → grid) are a single linear if/else-if/else chain with
  nothing left to fall through to a blank render.

## 🔴 Critical (must fix before merge)
None.

### Core-defect verification (the data-integrity claim, checked rigorously)
Traced end to end; all four invariants hold:

1. **`hydrated` set only on success** — `useSpacesStore.ts:446` sits inside the `try`,
   after the `await` on `:434-436`. The `catch` (`:456-459`) touches only
   `console.error` and `hydrateStatus`. FR-3's load-bearing line is correct.
2. **Seed unreachable on failure** — the `if (total.value === 0)` block (`:449-455`)
   is inside the `try`, below `hydrateStatus = 'loaded'`, and reads a `total`
   assigned from a resolved `result` (`:444`). `seedFridge` has exactly two call
   sites repo-wide: this one and `data/onboarding.ts:54` (explicit user-chosen space
   creation) — no other auto-seed path exists.
3. **Expired-token (401) really lands in the failed state** — I checked for a
   refresh/retry interceptor that could instead turn a 401 into a sign-out redirect:
   `useApiClient.ts` installs only `BaseBearerTokenAuthenticationProvider`, with no
   401 middleware, and `useAuth.refresh` has no caller on this path. A 401 therefore
   rejects `api.listPage` → `catch` → `'failed'` panel, with no mutation. The exact
   scenario the task was written for is closed.
4. **No partial state slips a write through** — the only mutations between the
   `await` and the seed are local refs; `createRemote` is reached only after
   `hydrateStatus = 'loaded'`. `DashboardView.showEmptyState` (`:202`) now also
   requires `store.hydrated`, so the empty-state "Create a space" CTA is unreachable
   while pending or failed.

## 🟠 Major (strongly recommended)
### [M1] Concurrent `hydrate` calls are last-writer-wins — a losing failure can paint the error panel over a loaded grid
**File**: `src/Tidansu.App/src/stores/useSpacesStore.ts:429-460`
(callers: `src/Tidansu.App/src/App.vue:27`, `src/Tidansu.App/src/composables/useAuth.ts:29`)
**Category**: Correctness

**Description**: `tech-tasks.md:59-60` justifies omitting concurrency protection with
"Today the two callers cannot overlap (boot-with-tokens vs. sign-in-without-tokens)".
That premise does not hold. `App.vue:27` fires `void spaces.hydrate()` on mount
whenever `auth.hasTokens`; `LoginView.consumeToken` → `useAuth.consume:29` fires
`await spaces.hydrate(true)`. A user who is *already signed in* (tokens in storage)
and opens a fresh magic link — e.g. requested a new link in the same browser without
signing out — full-page-loads `/login?token=…`, so App mounts with `hasTokens` true
and both calls run while `hydrated` is still `false`. There is no in-flight guard, so
both proceed.

Because `hydrateStatus` is a single ref with no request identity, the *last settling*
call wins. If the forced fetch succeeds and the non-forced one then fails (or 401s on
the pre-refresh token), the dashboard ends in `'failed'` while `spaces`/`total` hold
real data: the user sees "Couldn't load your spaces" over an account that loaded
fine, with "New space" disabled. Recoverable via Retry, and **not** a data-integrity
issue — the seed still cannot fire, since it is gated on the resolved `total` of its
own call, not on `hydrateStatus`. The same staleness shape survives `reset()`: a
sign-out during an in-flight hydrate sets `'idle'`, then the still-pending call's
`catch`/success re-arms `'failed'`/`'loaded'` afterwards — the exact scenario the
`reset()` task was added to prevent.

**Recommendation**: Keep the deliberate no-early-return (M1 is not an argument
against it — `useAuth.consume`'s await contract must hold). Add a generation counter
so only the newest call may write status; this also fixes `reset()`-mid-flight:

```ts
let hydrateEpoch = 0;

async function hydrate(force = false): Promise<void> {
    if (hydrated.value && !force) return;
    const epoch = ++hydrateEpoch;
    hydrateStatus.value = 'loading';
    try {
        // …unchanged…
        if (epoch !== hydrateEpoch) return;   // superseded: don't write state or seed
        hydrated.value = true;
        hydrateStatus.value = 'loaded';
        // …seed…
    } catch (e) {
        console.error('[spaces] hydrate failed', e);
        if (epoch === hydrateEpoch) hydrateStatus.value = 'failed';
    }
}
```
plus `hydrateEpoch++` in `reset()` alongside `hydrateStatus.value = 'idle'`. Either
way, correct the false "cannot overlap" claim at `tech-tasks.md:59-60` so the next
reader doesn't re-derive it.

## 🟡 Minor (nice-to-have)
### [N1] FR-1 — the loading state itself — is asserted by no test
**File**: `src/Tidansu.App/src/stores/useSpacesStore.hydrate.test.ts:55-107`
**Category**: Test quality

**Description**: All four cases assert *terminal* state. Nothing observes
`isHydrating === true` while a fetch is in flight, and nothing asserts that a retry
re-enters `'loading'` (FR-4's "panel is replaced by the spinner"). Deleting
`hydrateStatus.value = 'loading'` from `useSpacesStore.ts:431` would leave all 12
tests green — the headline requirement is guarded only by the manual drive.
`reset()` → `'idle'` (its own tech task) is likewise untested.
**Recommendation**: One deferred-promise case:
```ts
let resolveFetch!: (v: unknown) => void;
api.listPage.mockReturnValueOnce(new Promise((r) => { resolveFetch = r; }) as never);
const p = store.hydrate(true);
expect(store.isHydrating).toBe(true);
resolveFetch({ spaces: [], total: 1, page: 1, pageSize: 20 });
await p;
expect(store.isHydrating).toBe(false);
```
plus a two-liner asserting `reset()` clears `isHydrateFailed`.

### [N2] Grid branch uses `v-else-if="showGrid"` where the plan specified `v-else`
**File**: `src/Tidansu.App/src/views/DashboardView.vue:104` (computed at `:203-205`)
**Category**: Correctness / maintainability

**Description**: `showGrid` is the exact negation of the three preceding branches, so
the four states *are* mutually exclusive and exhaustive today — nothing falls through
to a blank render. But expressing the final branch as a negation duplicates the
chain's logic in two places: a future edit to one computed, or a reorder of the
chain, can silently produce a state where all four are false and the content area
renders empty. `tech-tasks.md:94` specified `v-else` for exactly this reason, and
`SpaceView.vue` uses a plain terminal branch.
**Recommendation**: Make the grid `v-else` and delete `showGrid`.

### [N3] Loading block has no assistive-tech announcement
**File**: `src/Tidansu.App/src/views/DashboardView.vue:59-69`
**Category**: Accessibility

**Description**: The pulsing icon + "Loading…" carries no `role="status"` /
`aria-live="polite"`, so a screen-reader user gets silence during the fetch and no
announcement when the grid replaces it. Copied faithfully from `SpaceView.vue:17-28`,
which has the same gap — a pre-existing pattern issue, not a regression.
**Recommendation**: Add `role="status"` to the wrapper in both places when convenient.

## 🧭 Convention Violations (project rules)
None found.
- **Template purity**: every new binding is plain property access (`isLoadingSpaces`,
  `loadFailed`, `showEmptyState`, `showGrid`, `isCreateDisabled`); all are `computed`;
  `onRetry` is a named handler; no ternary/`!`/`??`/lookup/arithmetic/display-method
  call anywhere in the added markup. `DashboardView.vue:203-205` correctly keeps the
  `!`-composition in `<script setup>`.
- **Colors**: `text-text-2`, `border-border`, `bg-surface`, `rounded-card` — `@theme`
  tokens only, no hex. `text-[14px]` / `:size="28"` are pixel sizes, not colors, and
  match the existing `SpaceView`/dashboard idiom.
- **Tailwind**: all classes static; no interpolated class strings.
- **TypeScript**: no `any`; the status union is inline-typed on the ref; no Kiota type
  re-declared (`vue-tsc` clean).
- No backend, schema, migration, DTO or Kiota surface touched — consistent with the
  LIGHT-path claim.

## 🏗️ Architecture Notes
- The seam choice is right: the whole state machine stays in the store and the view
  learns two booleans, mirroring `isContentsLoading`/`isContentsFailed` one level
  down. No parallel loading mechanism, no `useQuery` in the view, no TanStack
  internals leaked. `hydrate`'s new JSDoc (`useSpacesStore.ts:406-428`) records *why*
  the swallow and the missing early-return exist — the right place for it.
- **The four deliberate decisions all check out; I am not challenging any of them.**
  The swallow is a strict improvement over `LoginView`'s bare `catch` misreporting a
  spaces failure as an invalid link. The omitted in-flight early-return genuinely is
  required by `useAuth.consume`'s await contract — M1's fix preserves it rather than
  reversing it. `'idle'` → grid is necessary for `VITE_DISABLE_AUTH=true`, and is safe
  because the seed is gated on a resolved response, not on the rendered branch. The
  "New space" guard is UI-availability only: `limits.guard(limits.checkAddSpace())` is
  untouched and unduplicated in both `goCreate` and `onDuplicate`, and nothing in the
  new code opens the paywall.
- Pre-existing, out of scope, noted for the backlog: `hydrate` has no cancellation, so
  a fetch resolving *after* `reset()` writes the previous user's spaces into a
  signed-out store. Only reachable between sign-out and the login redirect, and the
  next sign-in's `hydrate(true)` overwrites `spaces` wholesale (`contentsLoaded` is
  cleared by `reset`, so the `deepLinked` carry-over can't preserve anything). The M1
  epoch guard closes this too — a good reason to prefer it over a narrower fix.
- **Scope creep: none.** Every changed line maps to a checked tech task. `subtitle`,
  `atSpaceLimit`, `spaceCards`, `newTile*` were left alone as the refactor task
  required. The `.claude/context/patterns.md` addition (three-state async read; the
  frontend vitest surface exists) is accurate and genuinely team-wide — good call.

## 👍 Positives
- FR-3 is defended where it actually lives — in the store, with the `hydrated`
  assignment and the seed physically inside the `try` — rather than by a view-level
  condition a later refactor could drop.
- The tests are non-tautological. Mutation-checked: moving `hydrated = true` before
  the `await` reddens cases 1 and 4; hoisting the seed out of the `try` reddens case
  1's `api.create` assertion; setting `hydrated` in the `catch` reddens case 4's call
  count. Case 3 is a real no-regression guard on the seed.
- The `queryClient.fetchQuery` mock invokes the passed `queryFn` instead of stubbing a
  value, so case 4 exercises the non-forced path's real transitions rather than a
  fiction.
- Retry correctly passes `force = true`; the reasoning about `staleTime`/`retry: 1`
  making the non-forced path non-deterministic is right and worth having in writing.
- `goCreate`'s backstop mirrors B-17's `onRename` backstop — consistent defensive idiom.
- Error copy is generic; the caught error goes only to `console.error` and never
  reaches the DOM, so no server message, status code or stack is surfaced.

## Action Checklist
- [x] [M1] Add a `hydrateEpoch` generation guard so only the newest `hydrate` may write `hydrateStatus`/`hydrated`/seed; bump it in `reset()`; correct the "cannot overlap" claim at `tech-tasks.md:59-60`.
- [x] [N1] Add a deferred-promise test asserting `isHydrating` during flight, plus a `reset()` → `'idle'` assertion.
- [x] [N2] Make the grid branch a plain `v-else` (drop the negation-duplicating `showGrid`).
- [ ] [N3] Add `role="status"` to the loading block here and in `SpaceView.vue`. **Out of scope for this follow-up** (explicitly deferred by the requester — pre-existing gap shared with `SpaceView.vue`).
