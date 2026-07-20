### 📋 Backlog Item
Give the initial spaces-list load (`App.vue` → `useSpacesStore.hydrate`) a real
loading state and a user-visible error+retry state, so a failed or in-flight
fetch is never mistaken for "this account has no spaces."

### 🎯 Product Context Summary
This is the top-level analogue of the per-space contents load already solved in
B-16/B-17: `SpaceView` distinguishes "still loading," "genuinely empty," and
"failed to load" for a single space's contents via `isContentsLoaded` /
`isContentsFailed`, with a `BaseEmptyState` + `Retry` action on failure. The
dashboard's spaces list has no such distinction today — `hydrate()` is
fire-and-forget, `DashboardView` gates its empty state purely on
`store.count === 0`, and a failed fetch (offline, 500, expired token) leaves
`spaces` at its initial empty array, indistinguishable from a brand-new
account. Worse, the empty state auto-seeds a starter fridge, so a real user
with real data can get a phantom fridge created after a network blip. This
task applies the same three-state pattern one level up, at the store's
`hydrate` entry point that feeds `App.vue` and `DashboardView`.

### 🔑 Core Functional Areas
- Loading state while the initial spaces fetch is in flight
- Error state with retry when the initial fetch fails
- Correct gating of the empty state and starter-fridge seed on genuine-empty vs failed
- Retry behaviour (success and repeated failure)

---

### Functional Requirements

**Initial load state**

- **FR-1**: While the first spaces fetch for the session is in flight, the dashboard shows a loading state instead of any card grid or empty state — the "No spaces yet" panel must never flash before the fetch resolves.
  - *Business rationale*: A returning user with data should never see a false "you have nothing" moment, even for a split second; it erodes trust and, uncorrected, can trigger the starter-fridge seed.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A — applies identically to Free and Pro; not plan-gated.
  - *Constraints/Rules*: Loading state only applies to the *first* hydrate of a session (or an explicit retry after failure) — it must not reappear on normal navigation back to the dashboard once spaces are already hydrated, and it must not block/replace the rest of the app shell (header, nav) which stays interactive.
  - *Acceptance criteria*: Given a fresh session with a slow/pending spaces response, the dashboard shows a loading indicator and no empty-state panel or card grid until the response settles.

**Failed load state**

- **FR-2**: A failed initial hydrate (network error, server error, expired/invalid auth) renders a user-visible error panel in place of the spaces list, with a message explaining the load failed and a "Retry" action.
  - *Business rationale*: Matches the existing per-space failed-load precedent (`SpaceView`'s "Couldn't load this space" panel) so the product has one consistent vocabulary for "we couldn't load your data" instead of silently showing an empty account.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A — not plan-gated.
  - *Constraints/Rules*: The error panel replaces only the spaces content area, not the whole page — header, "New space" button, and navigation remain visible/usable so the user isn't fully stuck (though creating a space while hydrate is unresolved should be handled gracefully, see FR-5). Wording should be generic and non-technical ("Couldn't load your spaces. Check your connection and try again."), consistent with `SpaceView`'s existing copy style.
  - *Acceptance criteria*: Given the initial spaces fetch rejects, the dashboard shows an error panel with a Retry button; the "No spaces yet" empty state is not shown; no starter fridge is created.

**Empty-state / seed gating**

- **FR-3**: The "No spaces yet" empty state and the starter-fridge auto-seed fire **only** when the initial hydrate succeeds and returns zero spaces — never when hydrate is still pending or has failed.
  - *Business rationale*: This is the core bug — today the empty state (and its seed side-effect) is driven off `spaces.length === 0`, which is indistinguishable from "haven't loaded yet" or "failed to load." A phantom starter fridge created after a transient network error is a real-data-integrity problem, not just a cosmetic one.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: The starter-fridge seed itself still counts toward the Free space cap as it does today; this task does not change seed/plan logic, only when it's allowed to fire.
  - *Constraints/Rules*: Three mutually exclusive dashboard states: loading (FR-1), failed (FR-2), loaded (either empty-with-seed or populated card grid, unchanged from current behaviour). A failed hydrate must never set the "hydrated" flag that the store currently uses to skip re-fetching, so a subsequent retry always re-attempts the real fetch rather than short-circuiting.
  - *Acceptance criteria*: Given hydrate is pending, no empty state or seed fires. Given hydrate fails, no empty state or seed fires and no space is created. Given hydrate succeeds with zero spaces, the empty state and starter-fridge seed fire exactly as they do today.

**Retry behaviour**

- **FR-4**: Clicking Retry on the error panel re-runs the spaces fetch; on success the dashboard transitions directly to the normal loaded view (populated grid or genuine empty state); on repeated failure the error panel is shown again.
  - *Business rationale*: A single stuck error screen with no way forward is worse than the original bug; retry must be immediately re-triggerable without a full page reload.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: While a retry is in flight, show the loading state (FR-1), not a stale error panel or a flash of empty state. Repeated failures keep re-showing the error panel (no retry-count limit or backoff UI is required for this task).
  - *Acceptance criteria*: Given the error panel is showing and the user clicks Retry, the panel is replaced by a loading state during the re-fetch, then either the populated/empty dashboard (on success) or the error panel again (on repeated failure).

**Shell resilience**

- **FR-5**: Actions that don't depend on the spaces list (navigating away, opening pricing, signing out) remain available while the dashboard is in the loading or error state.
  - *Business rationale*: A stuck or slow spaces fetch shouldn't strand the user in an unusable shell.
  - *Priority*: Phase 2 (Growth)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: "New space" may be disabled or deferred while hydrate is unresolved (its cap-check depends on knowing current space count) — exact treatment left to tech-lead judgment since it's a minor UX detail, not a data-integrity concern like FR-3.
  - *Acceptance criteria*: Given the dashboard is in loading or error state, the user can still navigate to another route via existing nav/header controls.

---

### ⚠️ Key Business Considerations
- **Never let a network blip look like data loss or trigger a seed.** The single most important rule in this task is FR-3 — a failed fetch must be visually and logically distinct from a genuine empty account, with zero side effects (no seed, no empty-state CTA).
- **Consistency of vocabulary.** Reuse the same failed-load pattern (icon, copy tone, Retry button) already established for per-space contents loading (`SpaceView`), so users learn one mental model for "Tidansu couldn't load something" across the app.
- **Don't over-engineer retry.** No backoff, retry limits, or offline-detection UI is asked for or needed here — a plain manual Retry button is sufficient for this slice.

### 🚫 Out of Scope (Phase 1)
- Automatic/background retry or offline detection.
- Retry-count limits or exponential backoff UI.
- Any change to plan/limit logic, the starter-fridge seed's content, or pagination ("Load more") behaviour — those are unchanged, just correctly gated.
- B-19 (surfacing non-plan space-sync failures on create/update/delete) — a separate, related task touching the same store; serialize implementation if both are in flight together.

### ❓ Open Questions for Product Owner
- Confirm the error-panel copy: is "Couldn't load your spaces. Check your connection and try again." (mirroring `SpaceView`'s existing wording) acceptable, or is different phrasing wanted for the top-level dashboard vs. a single space?
- Should "New space" be disabled while the initial hydrate is unresolved (loading or error), or is it acceptable to leave it clickable and let the existing cap-check handle it once spaces resolve? (FR-5 is left as Phase 2 / tech-lead judgment pending this answer.)
