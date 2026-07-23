# Code Review: B-25 overcap-badge-parity (uncommitted working tree on main)
**Date**: 2026-07-23
**Reviewer**: branch-code-reviewer agent
**Diff base**: HEAD (all B-25 work uncommitted; `git diff HEAD`)
**Files changed**: 19 modified + 2 new (excluding pipeline artifacts: backlog, patterns.md, agent-memory)

## Summary
Clean, spec-faithful implementation of server-sent over-cap truth: `SpaceSummaryDto.IsOverCap`
is computed in `GetSpacesQueryHandler` from the same `PlanPolicy.CheckSpaceContentMutation`
predicate `SpaceOverCapGuard` enforces with, using the page query's `skip + i` as rank
(verified against `SpacesRepository.GetSpaceSummariesPageAsync`'s `OrderBy(s => s.Id)` —
the rank-equivalence claim holds). The SPA side (merge-only `refreshOverCapFlags`,
`isInf` early-return, `duplicateSpace` flag clear) matches tech-tasks v2 task-for-task,
and the new vitest suite makes real assertions (reference equality, trigger counts).
One Major: the downgrade trigger watches the **optimistic** `setPlan` flip, so the flag
refetch races the plan-change commit server-side and can silently miss the badge set.
Verified: solution builds, `npm test` 43/43 green, Domain tests 67/67 green.

## 🔴 Critical (must fix before merge)
None.

## 🟠 Major (strongly recommended)

### [M1] Downgrade refresh races the plan-change commit (optimistic `setPlan` flip)
**File**: `src/Tidansu.App/src/stores/useSpacesStore.ts:746-751` (watch), `src/Tidansu.App/src/stores/useSessionStore.ts:131-132` (optimistic flip)
**Category**: Correctness | Functional (FR-1/FR-3 downgrade scenario)
**Description**: `setPlan` sets `user.value.plan = next` **before** calling
`account.changePlan(next)`. The spaces store's `watch(() => session.plan, ...)` therefore
fires on the *optimistic* flip, and `refreshOverCapFlags()`'s `GET /api/spaces` pages race
the still-in-flight `POST` plan change. If the server serves the GET before the plan
update commits (a coin flip on localhost; both requests are dispatched within one tick),
every summary comes back `isOverCap: false` — and in the direct-apply shape (`setPlan`'s
branch (c), the dev seam used for V-3 verification, plus `AccountView.vue:290` /
`PricingView.vue:261`) the plan value never changes again, so **no later trigger corrects
it**. The SPA then under-badges everything until a delete or reload — nondeterministically
reproducing the exact "badge set disagrees with the server" bug class B-25 exists to fix.
The Stripe production path is safe by accident: an immediate downgrade there is a
scheduled cancel (plan reverts, the real flip arrives later via `AuthResponse`, after the
webhook has committed — that watch firing fetches correct flags). Safety is unaffected
(403 → paywall backstop), but the feature's primary acceptance scenario (requirements.md
FR-1, tech-tasks FR-3 table row "Downgrade to Free": *"one round-trip (~100ms)"*) is
timing-dependent.
**Recommendation**: key the refresh to plan-change **settlement**, keeping the existing
plan watch (still needed for the `AuthResponse`/webhook flip). Minimal shape: add a
`planChangeEpoch = ref(0)` to `useSessionStore`, bump it in `setPlan`'s `.then` **and**
`.catch` (after all reconciliation branches), and widen the spaces-store watch to
`watch([() => session.plan, () => session.planChangeEpoch], ...)`. The redundant refresh
on the revert shapes is one cheap summaries request; the M2 merge-only contract makes
double-runs harmless.

## 🟡 Minor (nice-to-have)

### [N1] Refresh dropped (not deferred) while a hydrate is in flight
**File**: `src/Tidansu.App/src/stores/useSpacesStore.ts:727`
**Category**: Correctness
**Description**: `if (!hydrated.value || hydrateStatus.value === 'loading') return;` —
the doc says "fresh flags are about to arrive with it anyway", but that only holds if the
in-flight hydrate's *request* was sent after the plan change committed. A plan flip
landing while a hydrate is in flight (narrow: downgrade during boot/sign-in) drops the
refresh permanently, and the hydrate response may carry pre-downgrade flags. Note M1's
settlement trigger does not cover this — a settle-fired refresh would hit the same
early-return.
**Recommendation**: instead of dropping, set a `pendingFlagRefresh = true` and re-run it
when `hydrateStatus` settles to `'loaded'` (a small `watch`), or simply `await`-loop off
the loading state before proceeding.

### [N2] No epoch/overlap guard inside `refreshOverCapFlags`'s await loop
**File**: `src/Tidansu.App/src/stores/useSpacesStore.ts:726-740`
**Category**: Correctness
**Description**: the pre-flight check runs once; each `await api.listPage(...)` then
yields. A `reset()` (sign-out) or `hydrate(true)` starting mid-loop isn't detected, so a
late page response can merge pre-hydrate flags into post-hydrate objects, and
`total.value = result.total` (line 735) can overwrite a *newer* optimistic count — e.g.
snap back `addSpace`'s `total += 1` (line 842) if a create lands during a delete-triggered
refresh, briefly skewing `checkAddSpace`'s used-count until the next fetch. Two concurrent
refreshes (plan flip + rapid deletes) also interleave pages. All windows are narrow and
direction-safe-ish, but the store already owns the right tool.
**Recommendation**: capture `const epoch = hydrateEpoch` at entry and bail after every
`await` if it changed — `reset()` and `hydrate()` already bump it, so this also kills
sign-out stragglers for free (same pattern as `hydrate`'s own B-18 M1 guard). Optionally
an in-flight latch to coalesce concurrent calls.

### [N3] Refetched pages bypass the TanStack cache without writing back
**File**: `src/Tidansu.App/src/stores/useSpacesStore.ts:730`
**Category**: Convention / latent correctness
**Description**: `refreshOverCapFlags` calls `api.listPage` directly (correct — must not
be served a ≤30s-stale cache entry) but never `queryClient.setQueryData`, so
`spacesQueryKey(page)` entries keep pre-downgrade flags for `staleTime: 30_000`.
`hydrate(force)` establishes the pattern for exactly this case (`useSpacesStore.ts:666`).
Today no live path repaints from that stale cache (`hydrate(false)` only runs
un-hydrated; `loadMoreSpaces` fetches unloaded pages), so this is latent — but the store
and the cache now disagree, which is the kind of seam the next feature trips on.
**Recommendation**: `queryClient.setQueryData(spacesQueryKey(page), result);` inside the
loop.

## 🧭 Convention Violations (project rules)
None found.
- No template changes (component layer untouched, per tech-tasks); no hex, no dynamic
  Tailwind classes, no `any` in production code.
- Kiota client verified regen-only: `descriptionHash` updated, `isOverCap` additions are
  generator-shaped, and the `429` entries on `POST /api/spaces` are the expected pickup
  of the earlier rate-limit contract change (first regen since) — not hand edits.
- Layer discipline holds: flag computed in Application from a Domain predicate; the
  repository stays a pure projection (T-2 watch-out honored).

## 🏗️ Architecture Notes
- **One-code-path guarantee verified, not assumed**: `GetSpaceSummariesPageAsync` orders
  by `Id` and skips by the same key, so `skip + i` is exactly the rank
  `CountSpacesOrderedBeforeAsync` computes (both under the DB collation) —
  the flag and the guard genuinely share both the predicate and the ordering. The
  cross-referencing comments (SpaceSummaryDto, handler, guard, repo) pin all four corners.
- The second `FindByIdAsync` PK read per list request mirrors the accepted B-24 trade-off;
  no N+1 anywhere in the new path.
- Advisory-flag fail direction is safe by construction: absent/stale/tampered flag only
  changes pixels; every mutation still passes `SpaceOverCapGuard`, and an unbadged
  over-cap space falls back to 403 → `planReasonOf` → paywall.
- Security lens: flag computed inside the owner-scoped query about the caller's own
  spaces/plan — no new information exposure, no authZ change, no new endpoint.
- Both deferred open questions (flag on `GET /api/spaces/{id}`; sync-era refresh trigger)
  are excluded per the human's explicit deferral.
- Guideline freshened: appended one line to `.claude/context/patterns.md` (Frontend
  gotchas) — server-refresh triggers must key on *settlement*, not an optimistic store
  flip, generalizing M1.

## 👍 Positives
- The merge-only `refreshOverCapFlags` contract is exactly right for the M2 hazard, and
  test 1 proves it the only way it can be proven (reference equality + pre-set
  `zones`/`items` surviving — not an empty-fixture tautology).
- The overCapFlags suite's session-mock design comment (reassign-per-test to orphan
  earlier stores' watchers, `useSpacesStore.overCapFlags.test.ts:32-44`) shows the
  double-count hazard was found and handled, not stumbled past.
- `duplicateSpace`'s `overCap: false` (`useSpacesStore.ts:895`) closes the stale-clone
  hole before it existed; `deleteSpace`'s refresh threads through the remote success path
  (`.then(onSpaceDeleted)`), not the optimistic local removal.
- T-10's rewrite of the stale B-17 determinism comment is accurate and forward-defensive
  ("never derive over-cap from position, id sorting, or `localeCompare` again").
- All four pre-existing store suites got the required session mock with an identical,
  well-reasoned comment — no suite left broken by the new store composition.
- Verified green: `dotnet build` (0 errors), `npm test` 43/43, Domain tests 67/67.

## Action Checklist
- [x] [M1] Trigger `refreshOverCapFlags` on plan-change *settlement* (e.g.
      `planChangeEpoch` bumped in `setPlan`'s then/catch, watched alongside `plan`).
      **Fixed**: `useSessionStore.planChangeEpoch` (a `ref(0)`) is bumped in a single
      `.finally()` after `setPlan`'s `.then`/`.catch` chain (so every branch — success,
      checkout-redirect revert, scheduled-cancel revert, error revert — settles before
      the bump). `useSpacesStore`'s trigger watch is now
      `watch([() => session.plan, () => session.planChangeEpoch], ...)` — `plan` stays
      watched for the webhook/`AuthResponse` flip case where no local epoch bump ever
      happens; `planChangeEpoch` covers the optimistic-flip race this finding raised.
      Pinned by `useSpacesStore.overCapFlags.test.ts` test 5 (epoch bump alone, no plan
      change, triggers exactly one refetch).
- [x] [N1] Defer (don't drop) a refresh requested while hydrate is in flight.
      **Fixed**: `refreshOverCapFlags` now sets a `pendingFlagRefresh` flag and returns
      instead of dropping the request when `hydrateStatus === 'loading'`; a new
      `watch(hydrateStatus, ...)` replays the deferred refresh once hydrate next leaves
      `'loading'` (success or failure) — `refreshOverCapFlags` re-validates
      `hydrated`/`hydrateStatus` itself at replay time, so a replay after a no-op/failed
      hydrate is a safe no-op. Pinned by test 6.
- [x] [N2] Epoch-guard `refreshOverCapFlags`'s loop with `hydrateEpoch`.
      **Fixed**: captures `const epoch = hydrateEpoch` once past the early-return
      guards and bails after every page's `await` if `hydrateEpoch` changed (same
      pattern as `hydrate`'s own B-18 M1 guard) — a `reset()`/forced `hydrate()`
      starting mid-loop can no longer merge stale flags or stomp a newer `total`.
      Pinned by test 7 (`reset()` mid-refresh; the stale response's `total` is
      discarded, not applied).
- [x] [N3] `setQueryData(spacesQueryKey(page), result)` for each refetched page.
      **Fixed**: added right after the epoch check, before the merge, mirroring
      `hydrate(force)`'s cache write-back. Pinned by test 8.

All four findings fixed in one diff (`src/Tidansu.App/src/stores/useSessionStore.ts`,
`src/Tidansu.App/src/stores/useSpacesStore.ts`) plus four new vitest cases in
`useSpacesStore.overCapFlags.test.ts` (tests 5–8, 8/8 passing; full suite 47/47).
Verified: `npm test` green, `npm run build` (vue-tsc) green, `dotnet build` green
(untouched, pre-existing NU1903 warnings only). Manually re-drove the downgrade flow
in the running app (headless-Edge CDP, real client-side SPA navigation, no page
reload) against a Pro account with 3 spaces (cap 2 on Free): after clicking
"Switch to Free" and navigating back to the dashboard via the in-app nav link only,
exactly 1 space (`total − 2`) was badged read-only and the other two stayed fully
editable — no regression. The race M1 fixes specifically (the "coin flip on
localhost" timing) is not something a single manual drive can prove absent; that
guarantee comes from the deterministic epoch-based watch/tests above, not the manual
drive.
