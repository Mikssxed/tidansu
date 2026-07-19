---
name: two-item-remove-entry-points
description: SpaceView list view has TWO item-remove UI entry points; gating tasks routinely hide one and miss the other
metadata:
  type: project
---

The open-space list view exposes **two separate item-mutation controls**, both wired
to `SpaceView.onRemove`: (1) the Edit/Remove buttons inside `ItemDetailModal.vue`, and
(2) the inline per-row "×" button in `ItemRow.vue` (rendered by `ItemList.vue`).

**Why:** B-17 (read-only over-cap spaces) hid the modal's Remove but left the ItemRow
"×" visible-but-inert — the view-layer `onRemove` backstop made it a safe no-op, but it
is a lone silently-dead control against a feature whose whole point is "no unexplained
dead affordances." Easy to miss because the two controls live in different files and
only one was in the task's written scope.

**How to apply:** When reviewing any change that disables/hides item mutation
(read-only, plan gates, permissions), check BOTH `ItemDetailModal.vue` AND
`ItemRow.vue`/`ItemList.vue` — a hidden modal button is not enough. Same shape as
[[lazy-list-pagination-regression-checks]] and [[empty-fixtures-hide-rollback-bugs]]:
the list row is a second, easily-forgotten surface.
