# Code Review: B-3 · Levels (tiers) control — full-width and a bit bigger
**Date**: 2026-07-08
**Reviewer**: branch-code-reviewer agent
**Diff base**: working tree (uncommitted) vs HEAD
**Files changed**: 1 (`src/Tidansu.App/src/components/space/editor/ZoneProps.vue`)

## Summary
The Levels block now spans the full panel (`sm:col-span-2 lg:col-span-3` added to
its wrapper at `ZoneProps.vue:69-72`) with modestly larger padding, label, count
and stepper sizing, and a slightly roomier vertical shelf preview. All
level-count logic is untouched — the `v-if="!zone.floor"` gate, the 1–12 clamp,
`levelsAtMin`/`levelsAtMax` disabling, and `levelPreview` all remain exactly as
before. Meets FR-1..FR-4. Clean.

## 🔴 Critical (must fix before merge)
None.

## 🟠 Major (strongly recommended)
None.

## 🟡 Minor (nice-to-have)
None.

## 🧭 Convention Violations (project rules)
None.
- Template purity intact — no logic added to the template; `decLevels`/`incLevels`
  are named handlers, `levels`/`levelPreview`/`accentClass` are computeds, and the
  preview iterates the pre-mapped `levelPreview` array.
- Colors are all `@theme` tokens (`text-text-2`, `bg-surface-2`, `bg-surface-3`,
  `border-border`, `:class="accentClass"`); no hex, no dynamic class strings.
- The arbitrary pixel font sizes (`text-[13px]`, `text-[14px]`, `text-[16px]`,
  `text-[18px]`, `text-[12px]`) match the established convention used throughout
  this file and the codebase — pixel sizing, not color, so not a token violation.

## 🏗️ Architecture Notes
- Regression guard confirmed: `levels` (line 234), `levelsAtMin` (235),
  `levelPreview` (239-241), `levelsAtMax` (242), `decLevels` (276-278),
  `incLevels` (279-281) are all byte-for-byte unchanged — the "cosmetic edit must
  not alter the clamp/stepper" risk called out in requirements did not
  materialize.
- The full-width Levels item sits between Color and Facing in source order and
  breaks the grid row cleanly (spanning item forces a new row), so the surrounding
  Type/Color/Facing/Depth/Column cells still lay out without overlap. Relative
  order preserved per FR-1.
- Shelf preview kept as the vertical top→bottom stack per the owner's decision
  (no horizontal reflow), preserving level-1-at-top ordering and per-level accent.

## 👍 Positives
- Sizing bumps are tasteful and expressed purely via spacing/typography — no
  ad-hoc styling that clashes with the panel.
- Stepper hit targets improved (`size-7` centered buttons with hover/disabled
  states) without changing the underlying step logic.

## Action Checklist
- [ ] Nothing required — ready to merge on visual sign-off.
