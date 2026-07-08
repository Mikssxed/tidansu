# Requirements — [B-2] Shrink the delete-zone button in zone properties
_pm-requirements-analyst · 2026-07-08_

### 📋 Backlog Item
When editing a zone, make the "Delete zone" button visually smaller and less
dominant (not full-width, sized closer to its label) while keeping it clearly a
danger action and easy to hit — with no change to the delete behaviour, emit, or
confirmation flow.

### 🎯 Product Context Summary
Tidansu lets users edit zones on a space layout, and the zone properties panel is
where a zone's attributes and its delete action live. Today the destructive
"Delete zone" action stretches across the full width of that panel, giving a
low-frequency, high-consequence action more visual weight than it deserves and
inviting accidental attention. This is a purely visual refinement to right-size
the button so its prominence matches its importance. **This item touches no
backend, no API contract, and no plan limits** — plan-gating is not applicable
here; it is a frontend styling change only.

### 🔑 Core Functional Areas
- Visual sizing and placement of the delete-zone control in the zone properties panel
- Preserving the danger affordance and accessibility of the control
- Confirming no behavioural change to deletion

---

### Functional Requirements

**Delete-zone button appearance**
- **FR-1**: The "Delete zone" button in the zone properties panel must no longer
  span the full width of the panel; it must be sized closer to its own content
  (trash icon + "Delete zone" label) rather than stretching across all panel
  columns.
  - *Business rationale*: A destructive, rarely-used action should not be the most
    visually dominant element in the panel; right-sizing it reduces accidental
    prominence and keeps the panel calm.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A — no plan, cap, paywall `reason`, or downgrade behaviour
    involved. Frontend-only visual change.
  - *Constraints/Rules*: No backend, API contract, or plan-limit changes. The
    delete action, its emitted event, and any downstream confirmation flow must
    remain exactly as they are — only the button's footprint changes. The button
    should sit sensibly within the existing panel layout (e.g. not awkwardly
    isolated or overlapping other controls) at both narrow and wide panel widths.
  - *Acceptance criteria*:
    - The button occupies noticeably less horizontal space than the full panel
      width; its width is roughly proportional to its label rather than the panel.
    - The trash icon and "Delete zone" label remain fully visible and readable.
    - The panel remains visually coherent at the layout's supported widths (no
      overlap, clipping, or broken alignment introduced).

- **FR-2**: The delete-zone button must remain unmistakably a danger action.
  - *Business rationale*: Making the button smaller must not make its destructive
    nature ambiguous — users need to recognise it as the "remove this zone" action.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: Retain the existing danger styling/treatment and the
    trash icon so the destructive meaning is preserved. Do not restyle it into a
    neutral or secondary-looking control.
  - *Acceptance criteria*:
    - The button still reads visually as a destructive/danger action (danger
      colour treatment and trash icon retained).
    - A user can still tell at a glance that this control deletes the zone.

- **FR-3**: The delete-zone button must remain easy to hit and accessible.
  - *Business rationale*: Shrinking the control must not make it fiddly to tap or
    click, especially on touch, or degrade keyboard/assistive access.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: The clickable/tappable target must stay comfortably
    usable (a small button, not a tiny one). Label text and any accessible name
    are preserved.
  - *Acceptance criteria*:
    - The button remains comfortably clickable and tappable (target not reduced to
      an awkwardly small hit area).
    - The button is still reachable and operable by keyboard and exposes the same
      accessible label as before.

---

### ⚠️ Key Business Considerations
- **Proportional prominence.** The whole point is that visual weight should track
  action importance; a destructive, infrequent action earns a modest footprint.
- **No behavioural regression.** This is cosmetic only — deletion, its emit, and
  any confirmation must behave identically before and after.
- **Clarity over minimalism.** Smaller must not become unclear; the danger
  affordance and readability take precedence over shrinking for its own sake.

### 🚫 Out of Scope (Phase 1)
- Any change to delete behaviour, the emitted delete event, or confirmation flow.
- Any change to the "Levels (tiers)" control or other zone-properties controls
  (that is a separate backlog item, B-3).
- Backend, API contract, plan-limit, or paywall changes of any kind.
- Repositioning or restyling unrelated panel elements beyond what is needed to
  keep the panel coherent after the button shrinks.

### ❓ Open Questions for Product Owner
- **Placement preference:** should the smaller button stay on its own row
  (e.g. left- or right-aligned), or is sharing a row with adjacent controls
  acceptable if it stays visually distinct as the danger action?
- **Alignment:** any preference for where the right-sized button anchors within
  the panel (left vs right), given that a right-aligned destructive action is a
  common convention?
