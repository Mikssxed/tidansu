---
id: B-2
slug: shrink-delete-zone-button
title: Shrink the delete-zone button in zone properties
status: done         # implemented, driven-verified, reviewed clean, committed 2026-07-08
depends-on: []
touch-points:
  - src/Tidansu.App/src/components/space/editor/ZoneProps.vue
---

# B-2 · Shrink the delete-zone button in zone properties

## Description
When editing a zone, the "Delete zone" button spans the full width of the zone
properties panel, giving a rarely-used, destructive action more visual weight
than it deserves. Make it visually smaller and less dominant (not full-width,
sized closer to its label) while keeping it clearly a danger action and easy to
hit. Purely a frontend visual refinement — no change to delete behaviour, the
emitted event, or any confirmation flow. Touches no backend, no API contract, and
no plan limits.

## Acceptance criteria
- [x] The button no longer spans the full panel width; its width is roughly
      proportional to its label (trash icon + "Delete zone") rather than the panel.
- [x] The trash icon and "Delete zone" label stay fully visible and readable.
- [x] It still unmistakably reads as a danger action (danger treatment + trash icon retained).
- [x] It remains comfortably clickable/tappable (not a tiny hit area) and keyboard/assistive accessible with the same accessible name.
- [x] The panel stays visually coherent at the layout's supported widths (no overlap/clipping/broken alignment).

## Notes
**Decided by product owner (2026-07-08):** the button stays on its **own row** at
the bottom of the panel, **left-aligned**, shrunk to its label width (no longer
`col-span` full-width). Tech-lead stage **skipped** (trivial CSS); implement
directly from this brief + `requirements.md`.

Sibling UI tweak [[B-3]] also edits `ZoneProps.vue` (the Levels control) — the two
must be implemented **serially** (same file) even though their requirements are
written in parallel.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst ✅
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
