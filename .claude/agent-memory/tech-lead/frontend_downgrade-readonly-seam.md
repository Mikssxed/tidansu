---
name: frontend-downgrade-readonly-seam
description: Where the "over-cap content becomes read-only after downgrade" UI rule lives — a computed in useLimits, gated at the view layer, not the store
metadata:
  type: project
---

The downgrade "over-cap content is read-only" promise (CLAUDE.md plan rule; also in
`PricingView` FAQ copy) is enforced **client-side only** and layered as a presentation
gate — not in the spaces store, not on the server (B-17, Phase 1).

**Why:** the promise is UI honesty; server-side enforcement of the same rule is a
separate, still-open follow-up. A JWT holder can still mutate an over-cap space via
direct API until that lands.

**How to apply / where the seam is:**
- The single derived value lives in `src/Tidansu.App/src/composables/useLimits.ts`
  next to the `checkAdd*` gates: `readonlySpaceIds` = ids of `store.spaces.slice(caps.spaces)`
  (empty set when `isInf(caps.spaces)`, i.e. Pro), plus `isSpaceReadOnly(id)`. Live
  `computed` over `session.caps` + `store.spaces` — recomputes on upgrade/downgrade/add/delete,
  never snapshotted.
- Determinism rule: slice `store.spaces` **as-is** — it is already the server
  `GetSpaces` `OrderBy(s => s.Id)` order (= dashboard order). Never re-sort or key off
  insertion/creation order, or different spaces go read-only per render.
- Views (`DashboardView`, `SpaceView`) read the flag and pass a plain `readOnly` boolean
  down to dumb components (`SpaceCard`, `ItemDetailModal` via `canEdit`, `LayoutView`) as
  props; children never call the composable. Same pattern as the existing `limits.guard(...)`
  add-cap gating living in the views, not the store.
- Belt-and-suspenders: hide/disable the affordance in the child **and** early-return in
  the view's mutation handlers, so a missed control can never mutate. The spaces store
  stays a pure mutation mechanism with no plan logic.
- Free cap is 2 and spaces page size is 20, so over-cap spaces are always on the loaded
  first page — pagination never hides one (breaks only if a finite cap ≥ 20 is ever added).

Related: [[arch_plan-gate-decomposition-algebra]], [[validation-preempts-plan-gate-403]].
