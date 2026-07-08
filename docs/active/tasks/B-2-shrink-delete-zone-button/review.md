# Code Review: B-2 · Shrink the delete-zone button in zone properties
**Date**: 2026-07-08
**Reviewer**: branch-code-reviewer agent
**Diff base**: working tree (uncommitted) vs HEAD
**Files changed**: 1 (`src/Tidansu.App/src/components/space/editor/ZoneProps.vue`)

## Summary
A one-line, purely visual change: the delete-zone `BaseButton` gains
`justify-self-start` while keeping its `sm:col-span-2 lg:col-span-3` grid cell.
Because `BaseButton` renders an `inline-flex` element (not `w-full`), the grid
item now sizes to its content and left-aligns instead of stretching — the button
shrinks to `trash + "Delete zone"` width and anchors left, exactly the product
owner's 2026-07-08 decision. No script, emit, or behaviour change. Clean.

## 🔴 Critical (must fix before merge)
None.

## 🟠 Major (strongly recommended)
None.

## 🟡 Minor (nice-to-have)
None.

## 🧭 Convention Violations (project rules)
None. Template purity intact (`@click="onDelete"` is a named handler); `variant`
/`size` remain the mapped-Record props; no hex, no dynamic classes.

## 🏗️ Architecture Notes
- The grid cell still spans all columns (`sm:col-span-2 lg:col-span-3`); only the
  button element within it shrinks. This matches the brief ("own row at the
  bottom, left-aligned, shrunk to its label width") — the row is reserved
  full-width with the small button anchored left. No layout debt introduced.
- Behaviour verified unchanged: `onDelete` (`ZoneProps.vue:291`) still guards on
  `props.zone` and emits `delete`; no confirmation flow lives here to disturb.

## 👍 Positives
- Minimal, surgical edit — achieves the visual goal without touching logic.
- Reused the existing `danger`/`sm` variant + trash icon, so the danger
  affordance and accessible name (`Delete zone`) are fully preserved.

## Action Checklist
- [ ] Nothing required — ready to merge on visual sign-off.
