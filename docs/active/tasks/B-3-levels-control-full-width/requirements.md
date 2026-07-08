### 📋 Backlog Item
Give the "Levels (tiers)" control in the zone properties panel its own full-width
row and a slightly larger, clearer presentation, so setting the number of shelves
in a storage unit feels deliberate and readable — with zero change to the
level-count behaviour.

### 🎯 Product Context Summary
Tidansu lets people map real storage (fridge, freezer, cabinet) as zones and set
how many shelves/tiers each non-floor unit has. Today the "Levels (tiers)" control
is squeezed into one narrow cell of a multi-column properties grid, sitting next
to Type, Color, Facing, Depth and Column, so a meaningful structural choice (how
many shelves this unit has) reads as an afterthought. This item is a purely
visual/layout refinement: promote Levels to a full-width row and give it more
breathing room. No backend, no API, no plan limits — plan-gating is N/A because
this changes presentation only, not what content a user can create.

### 🔑 Core Functional Areas
- Layout: promote the Levels control from a narrow grid cell to a full-width row.
- Visual clarity: make the control read as slightly larger and more deliberate.
- Behaviour preservation: level count, 1–12 bounds, +/- stepping, shelf preview,
  and the non-floor-only condition all stay exactly as-is.
- Shelf-preview presentation within the new wider container.

---

### Functional Requirements

**Full-width placement**
- **FR-1**: The Levels (tiers) control must occupy its own full-width row within
  the zone properties panel, spanning the full width the panel offers at each
  supported width, rather than sharing a row as one narrow column beside other
  controls.
  - *Business rationale*: Choosing how many shelves a unit has is a structural
    decision about the physical storage; giving it a dedicated, unmissable row
    makes that choice feel intentional instead of cramped.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A (visual only — no content or capability added, no paywall
    reason, no downgrade impact).
  - *Constraints/Rules*: The control keeps its current position in the logical
    flow of properties (it should not jump to the top or bottom of the panel); it
    simply spans the row instead of a single cell. The full-width change is most
    visible at wider layouts; at the narrowest width the panel is already a single
    column, so the control must still look correct and full-width there too.
  - *Acceptance criteria*:
    - At every supported panel width, the Levels control spans the full available
      width and is not boxed into a single narrow column beside another control.
    - No other control overlaps, wraps awkwardly, or is pushed off-panel as a
      result; the surrounding grid still lays out cleanly.
    - The control remains in the same relative order among the zone properties.

**Larger / clearer presentation**
- **FR-2**: The Levels control must read as slightly larger and clearer — a
  comfortable, deliberate control — while staying visually consistent with the
  rest of the panel (same styling language, tokens and density).
  - *Business rationale*: Readability and a sense of deliberateness reduce
    mistakes when setting shelf counts and make the panel feel considered.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: "Slightly larger" — a modest, tasteful increase in size
    /spacing, not an oversized element that unbalances the panel or dwarfs its
    neighbours. Must respect the app's existing spacing/typography tokens (no
    ad-hoc styling that clashes with the panel). The −/count/+ stepper must stay
    easy to read and easy to hit.
  - *Acceptance criteria*:
    - The label, the current level count, and the −/+ controls are clearly
      readable and comfortably spaced within the wider row.
    - The control does not look oversized or out of proportion relative to the
      other properties in the panel.
    - Styling still matches the panel (borders, surfaces, text tones) — nothing
      looks bolted on.

**Shelf-preview presentation**
- **FR-3**: The shelf preview (the L1…Ln list beneath the stepper) must continue
  to reflect the current level count and remain legible inside the now-wider
  control.
  - *Business rationale*: The preview is how a user confirms "this unit will have
    N shelves" before committing; it must stay obviously connected to the count.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: The preview must still show exactly one entry per level,
    ordered top → bottom (level 1 = top), matching the existing behaviour. Its
    *behaviour* (how many entries, their order, the colour accent) must not
    change; only its layout within the wider container may adapt so a full row of
    preview entries does not look sparse or awkward. If the preview is reflowed to
    use the extra horizontal space, ordering top→bottom by level must still be
    unambiguous.
  - *Acceptance criteria*:
    - The number of preview entries always equals the current level count (1–12).
    - Preview entries stay in level order and each still carries the zone's colour
      accent.
    - At the maximum (12 levels) the preview remains readable and does not break
      the panel layout.

**Behaviour preservation (regression guard)**
- **FR-4**: All existing Levels behaviour must be preserved unchanged: minimum 1,
  maximum 12, +/- stepping (with the − disabled at 1 and + disabled at 12), and
  the control appearing only for non-floor zones.
  - *Business rationale*: This is a cosmetic pass; changing the underlying rules
    would be an unintended, out-of-scope side effect.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: Floor zones must still not show the Levels control at
    all. The count still clamps to 1–12. Editing levels still updates the selected
    zone exactly as before.
  - *Acceptance criteria*:
    - − is disabled at 1, + is disabled at 12, and stepping moves one level at a
      time within 1–12.
    - Selecting a floor zone shows no Levels control.
    - Setting a level count updates the zone and its preview identically to the
      pre-change behaviour (observable no-diff in behaviour).

---

### ⚠️ Key Business Considerations
- **Cosmetic only — protect the logic.** The single biggest risk is a "visual"
  edit accidentally altering the 1–12 clamp, the stepper disabling, or the
  non-floor condition. Treat behaviour preservation as a hard regression guard.
- **Proportion over prominence.** "Bigger and clearer" is about deliberateness,
  not dominance — the control should feel considered, not shout over the rest of
  the panel.
- **Consistency.** Use the panel's existing styling language; this refinement
  should look native, not like a one-off.
- **Shared file with B-2.** This edits the same `ZoneProps.vue` block area as B-2
  (shrinking the delete button); implement the two serially to avoid churn.

### 🚫 Out of Scope (Phase 1)
- Any change to what levels *mean* or *do* (no new max, no free-text entry, no
  per-level naming or contents).
- Reworking the other zone properties (Type, Color, Facing, Depth, Column) or the
  overall grid beyond what's needed to give Levels its full-width row.
- Any plan/paywall interaction — levels are not plan-gated.
- Backend, API, or persistence changes.

### ❓ Open Questions for Product Owner
- **Preview reflow at width:** With a full-width control, should the shelf preview
  keep its current top→bottom vertical stack (which may look sparse when wide), or
  reflow to use the horizontal space (e.g. wrap into rows) while still reading
  level 1 → level N? *Assumption:* keeping the vertical top→bottom stack is
  acceptable for Phase 1; reflow is a nice-to-have only if the vertical stack
  looks awkward at width.
- **"Slightly larger" magnitude:** Is a modest bump in padding/label size enough,
  or does the product owner want the stepper controls themselves visibly larger
  (bigger −/+ hit targets)? *Assumption:* modest, tasteful sizing that keeps the
  panel balanced.
