---
id: B-3
slug: levels-control-full-width
title: Levels (tiers) control — full-width and a bit bigger
status: done         # implemented, driven-verified, reviewed clean, committed 2026-07-08
depends-on: []
touch-points:
  - src/Tidansu.App/src/components/space/editor/ZoneProps.vue
---

# B-3 · Levels (tiers) control — full-width and a bit bigger

## Description
In the zone properties panel the "Levels (tiers)" control sits in a single narrow
grid column and looks cramped next to the other controls. Make it span the full
width of the zone properties panel and be slightly larger/clearer, so adding
shelves to a unit feels deliberate and readable. Purely a layout/visual
refinement — the level-count logic, the 1–12 min/max, and the shelf preview stay
the same. Touches no backend, no API contract, and no plan limits.

## Acceptance criteria
- [x] The Levels (tiers) control spans the full width of the zone properties panel
      rather than a single narrow column.
- [x] The control reads as slightly larger/clearer (comfortable, deliberate) without breaking the panel layout at supported widths.
- [x] Level-count behaviour is unchanged: min 1, max 12, +/- stepping, and the shelf preview all work exactly as before.
- [x] The control is still only shown for non-floor zones (unchanged conditional).

## Notes
Sibling UI tweak [[B-2]] also edits `ZoneProps.vue` (the delete button) — implement
the two **serially** (same file). The Levels block is the `<!-- Levels -->` section
(~lines 68–107) currently placed as one cell in the `grid-cols-1 sm:grid-cols-2
lg:grid-cols-3` layout; making it full-width means spanning all columns.

**Decided by product owner (2026-07-08):** make the Levels control a **full-width
row** (span all columns) and modestly larger/clearer; **keep the shelf preview as
the current vertical top→bottom stack** (do NOT reflow horizontal). Tech-lead stage
**skipped** (trivial CSS); implement directly from this brief + `requirements.md`.

Gaps surfaced during requirements (see `requirements.md`):
- The full-width change is only visible at the `sm`/`lg` breakpoints; at the
  narrowest width the panel is already a single column, so the control must still
  look correct there.
- Open question for product owner: the shelf preview is currently a vertical
  top→bottom stack (level 1 = top). At full width it may look sparse — decide
  whether to keep the vertical stack (assumed OK for now) or reflow it
  horizontally while keeping level 1 → N ordering. Preview *behaviour* (one entry
  per level, order, colour accent, legible at 12 levels) must not change.
- Keep the control in its current relative order among the properties; don't move
  it to the top/bottom of the panel.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
