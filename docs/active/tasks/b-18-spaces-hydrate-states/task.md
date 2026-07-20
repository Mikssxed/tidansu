---
id: B-18
slug: spaces-hydrate-states
title: Loading + error/retry states for spaces hydrate (U-2)
status: done   # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: []
touch-points:
  - src/Tidansu.App/src/App.vue
  - src/Tidansu.App/src/stores/useSpacesStore.ts
  - src/Tidansu.App/src/views/DashboardView.vue
---

# B-18 · Loading + error/retry states for spaces hydrate (U-2)

## Description
From the B-8 audit (🟠 U-2). The initial spaces load (`App.vue` →
`useSpacesStore.hydrate`) is fire-and-forget with no loading or error state. A
failed fetch (offline, 500, expired token) leaves `spaces = []`, so
`DashboardView` shows "No spaces yet" to a user who *has* data — and can trigger
the starter-fridge seed as if it were a brand-new account. Even the happy path
flashes the empty state until the fetch resolves.

## Acceptance criteria
- [x] A loading indicator is shown while the initial spaces fetch is in flight — the
      empty state never flashes on the happy path (FR-1).
- [x] A failed hydrate renders a user-visible error panel (in place of just the spaces
      content area — header/nav stay usable) with a working "Retry" action, wording
      consistent with `SpaceView`'s existing "Couldn't load…" pattern (FR-2).
- [x] The "No spaces yet" empty state and the starter-fridge seed fire **only** on a
      successful response that is genuinely empty — never while pending and never
      after a failed fetch. A failed hydrate must not set the store's `hydrated` flag,
      so retry always re-attempts the real fetch (FR-3).
- [x] Clicking Retry re-runs the fetch: shows the loading state while in flight, then
      either the normal loaded dashboard (success) or the error panel again (repeated
      failure) (FR-4).
- [x] No regression to normal dashboard rendering once spaces have loaded.

## Notes
- Backlog says to expose TanStack Query's `isLoading`/`isError` — confirmed `hydrate`
  already goes through `queryClient.fetchQuery`, but no loading/error state is
  currently exposed to `App.vue`/`DashboardView`; this needs adding.
- Direct precedent already in the codebase: `SpaceView.vue` + `useSpacesStore`'s
  `isContentsLoaded`/`isContentsFailed`/`loadSpaceContents` solve the identical
  three-state (loading/failed/genuine-empty) problem one level down, for a single
  space's contents (see B-16/B-17). Reuse that pattern's shape and its
  `BaseEmptyState` + Retry-button UI for the top-level spaces list.
- Related: [B-19] (surface non-plan space-sync failures) touches the same store
  (`useSpacesStore.ts`, `handleSyncError`). **Serialize implementation** with B-19
  if that task is ever in flight at the same time.
- Open questions (see requirements.md): exact error-panel copy; whether "New space"
  should be disabled while hydrate is pending/failed (left as Phase 2/tech-lead call).

### Tech-planning decisions (2026-07-20, see `tech-tasks.md`)
- **Both open questions resolved by the human.** (a) Reuse `SpaceView`'s existing
  "Couldn't load…" wording — planned as *"Couldn't load your spaces" / "Something
  went wrong loading them. Check your connection and try again."* (same sentence
  pattern, noun corrected for the account level — flagged as OQ-1, not a blocker).
  (b) "New space" is **disabled while hydrate is pending or failed** — a UI
  availability guard only; `limits.guard(limits.checkAddSpace())` remains untouched
  as the single cap enforcement.
- **Seam:** the store's `hydrate` interface gains a private
  `hydrateStatus: 'idle'|'loading'|'loaded'|'failed'` plus two read-only getters
  (`isHydrating`, `isHydrateFailed`), mirroring the existing
  `isContentsLoading`/`isContentsFailed` trio. No new composable, no `useQuery` in
  the view, no rewrite of the `queryClient.fetchQuery` call.
- **`hydrate` now swallows its error** instead of rejecting. Deliberate side effect:
  `LoginView.consumeToken`'s bare `catch` currently turns *any* hydrate failure into
  "That sign-in link is invalid or has expired" for a user whose tokens were in fact
  set — after this change sign-in completes and the dashboard shows the real error
  panel. It also removes an existing unhandled promise rejection from `App.vue`.
  Do not "fix" the swallow back into a rethrow.
- **Do not add an in-flight early-return to `hydrate`** — `useAuth.consume` awaits it
  and would navigate to a still-empty dashboard.
- **The `'idle'` state (no tokens / `VITE_DISABLE_AUTH=true`) renders the grid branch**,
  not the spinner — otherwise the dev bypass shows a permanent spinner.
- Confirmed the frontend **does** have a vitest surface (`npm test`,
  `useSpacesStore.flush.test.ts`); a `useSpacesStore.hydrate.test.ts` is planned for
  the data-integrity criterion (FR-3, no phantom starter fridge).
- Path confirmed **LIGHT**: 3 source files + 1 test file, no migration, no Kiota regen.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
