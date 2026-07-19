# Code Review: B-17 · Reflect read-only over-cap spaces after downgrade (U-1)
**Date**: 2026-07-19
**Reviewer**: branch-code-reviewer agent
**Diff base**: origin/main (uncommitted working tree on `main`)
**Files changed**: 11 source files (+ 1 new component, + docs/memory)

> **Resolution (post-review, applied inline in orchestration):** all findings below
> are **fixed**. **M1** — `ItemRow`/`ItemList` now thread a `readOnly` prop and hide
> the per-row remove "×" (`v-if="!readOnly"`) instead of leaving it inert, matching
> the ItemDetailModal T7 pattern. **Minor 1** — `LayoutView` + `LayoutTop`/`MapZone`/
> `ShelfUnit`/`ShelfElevation` now use `withDefaults(..., { readOnly: false })`.
> **Minor 2** — `startEditing` in `SpaceView` got a `if (readOnly.value) return;`
> backstop. `npm run build` (vue-tsc + vite) green after the changes.

## Summary
A clean, well-scoped frontend-only implementation. The whole feature hangs off one
live `computed` seam in `useLimits.ts` (`readonlySpaceIds`/`isSpaceReadOnly`) that is
correct on every dimension the spec calls out: it slices `spaces.spaces` as-is (no
re-sort), early-returns an empty set on Pro/unbounded, and re-derives live off two
reactive sources so downgrade/upgrade/add/delete all reflect with no snapshot. The
gate is threaded consistently through the dashboard card, the open space, the item
modal, and the entire layout child chain, with view-layer backstops behind every
hidden control. One real gap remains: the inline per-row item remove ("×") in
`ItemList`/`ItemRow` is visible-but-inert rather than hidden — a partial FR-4 miss
the developer already flagged. No plan-limit or paywall-guard regressions found.

## 🔴 Critical (must fix before merge)
None.

## 🟠 Major (strongly recommended)

### [M1] Item-row remove "×" is visible-but-inert on a read-only space (partial FR-4 miss)
**File**: `src/Tidansu.App/src/components/space/ItemRow.vue:41-51` (control) →
`src/Tidansu.App/src/components/space/ItemList.vue:72-80,116-125` →
`src/Tidansu.App/src/views/SpaceView.vue:65` (`@remove="onRemove"`, backstopped at `onRemove` line ~247)
**Category**: Functional (FR-4)
**Description**: On a read-only over-cap space the list view still renders the per-row
"×" remove button on every item. Clicking it is a guaranteed no-op — `onRemove`
early-returns on `readOnly.value` — so there is **no correctness/data gap**. But FR-4's
acceptance is "removing an existing item ... is disabled/hidden" and the whole feature's
stated UX principle (FR-2 rationale) is that *an unexplained dead control reads as a bug*.
Every other affordance in this task is **hidden** (Smart Add, item-modal Edit/Remove,
"Edit layout", all AddChips, card Rename) — this one control is the lone silently-inert
exception, and it silently swallows the click with zero feedback, which is exactly the
anti-pattern the spec set out to remove. The developer flagged this in `task.md` as a
scope call; per the task's own "hide, don't just disable" treatment it is worth closing.
**Recommendation**: Thread the flag one level further — add `readOnly?: boolean` (or
`canRemove?: boolean`, default `true`) to `ItemList` and `ItemRow`, bind
`:read-only="readOnly"` from `SpaceView`'s `<ItemList>`, and wrap the remove `<button>`
in `v-if="!readOnly"`. Mirrors the exact ItemDetailModal T7 pattern; keeps `@select`
(viewing) untouched per FR-5.

## 🟡 Minor (nice-to-have)

### [N1] Layout components omit `withDefaults` for the optional `readOnly` prop
**File**: `LayoutView.vue:88`, `LayoutTop.vue`, `MapZone.vue`, `ShelfElevation.vue`,
`ShelfUnit.vue` (all `const props = defineProps<Props>()`)
**Category**: Correctness (consistency)
**Description**: `readOnly?: boolean` is declared optional but has no `withDefaults`, so
it is `undefined` (not `false`) when a parent omits it. `SpaceCard` and `ItemDetailModal`
in this same diff do use `withDefaults`. It works today because `v-if="!readOnly"`
treats `undefined` as falsy and `SpaceView` always passes the prop, so this is purely a
consistency nit — no runtime bug.
**Recommendation**: Optional. Add `withDefaults(defineProps<Props>(), { readOnly: false })`
to match the two guarded components, or leave as-is if the layout family's no-default
style is deliberate.

### [N2] `startEditing` (enter layout editor) has no view-layer backstop
**File**: `src/Tidansu.App/src/views/SpaceView.vue` (`@edit="startEditing"`)
**Category**: Functional (defense-in-depth)
**Description**: T9 backstops every *mutation* handler, and the "Edit layout" button is
hidden when read-only, so the editor is unreachable and every mutation it can emit
(`onAddColumnZone`/`onUpdateZone`/`onDeleteZone`/`onConvert`) is itself backstopped —
entering the editor mutates nothing. So this is redundant defense only, noted for
completeness, not required.
**Recommendation**: Optional — an `if (readOnly.value) return;` in `startEditing` would
make "no read-only path reaches the editor UI at all" true by construction.

## 🧭 Convention Violations (project rules)
- None found. Checked against CLAUDE.md's strict frontend rules:
  - **Template purity**: `v-if="!readOnly"` is an established structural-directive idiom
    in this codebase (18 pre-existing usages, e.g. `PlanCard`, `UsageMeter`, `AccountView`)
    and is not the forbidden "`!` used to produce a value or class" case — no violation.
    `DashboardView`'s `spaceCards` correctly pre-maps `readOnly` into the `v-for` array so
    `isSpaceReadOnly` never appears in the template (T3/T11 done right).
  - **@theme tokens / no hex**: no hardcoded hex in any changed file; `SpaceReadonlyBadge`
    styles entirely via `BaseBadge variant="warn"`.
  - **Static Tailwind / variant styling / granular components**: `SpaceReadonlyBadge` is a
    correct DRY presentational component; dumb children take a plain `readOnly` prop and
    never call the composable.
  - **No `any`, no duplicated Kiota types**: none introduced.

## 🏗️ Architecture Notes
- The seam placement is right: the read-only decision lives beside the existing
  `checkAdd*` gates in `useLimits`, views own the plan decision and pass a plain boolean
  down, and the spaces store stays a pure mutation mechanism with zero plan logic pushed
  into it. Matches the established add-cap guard pattern exactly.
- **Hide-in-child + backstop-in-view is the correct belt-and-suspenders shape** and is
  applied consistently everywhere except the M1 control (which has the backstop but not
  the hide). Closing M1 makes the pattern uniform.
- **Known, accepted debt (do NOT re-flag):** UI-only enforcement — a JWT holder can
  still mutate an over-cap space via direct API. Explicitly out of scope, tracked as B-23.
- The determinism invariant (slice server order as-is, never re-sort) is both implemented
  and documented in a code comment on `readonlySpaceIds`.

## 👍 Positives
- `readonlySpaceIds` early-returns `new Set()` before any `slice`, so `slice(Infinity)`
  is never hit on Pro and no space is ever flagged — matches FR-7's "falls out of the
  computed" design with no separate clear path.
- Every layout add entry point is covered: verified the full chain
  `LayoutView → ShelfElevation/LayoutTop → ShelfUnit/MapZone → AddChip`, and all three
  AddChip sites plus `ShelfElevation`'s floor AddChip are gated.
- Viewing paths (`onSetView`, `onSelect`, `closeDetail`, item-detail read, List/Layout
  toggle) are deliberately left live — FR-5 respected. Delete (`onDelete`) untouched —
  FR-6 recovery path preserved.
- Add-cap paywall guards (`checkAddSpace/Zone/Item`, locked "New space" tile, at-limit
  banner) are entirely untouched — no FR-8 regression.
- Thorough T13 manual end-to-end verification recorded in `task.md`, including the
  no-reload upgrade round-trip (`window.__marker` survival) and the inert-remove no-op.

## Action Checklist
- [ ] [M1] Thread `readOnly` into `ItemList`/`ItemRow`; `v-if="!readOnly"` on the remove "×" button (hide, matching every other affordance).
- [ ] [N1] (optional) Add `withDefaults(..., { readOnly: false })` to the layout components for consistency.
- [ ] [N2] (optional) `if (readOnly.value) return;` in `startEditing` for complete editor-entry coverage.
