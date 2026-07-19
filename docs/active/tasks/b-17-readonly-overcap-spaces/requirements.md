### 📋 Backlog Item
After a Pro→Free downgrade, the spaces beyond the Free plan's space cap must become visibly and functionally read-only in the SPA — matching the promise already made in the product's own pricing FAQ, which today nothing enforces client-side.

### 🎯 Product Context Summary
Tidansu's rule is "downgrade keeps data but makes over-cap content read-only" — never delete-on-downgrade. Today `useLimits`/`checkAddSpace` only stops a Free user from *creating* a 3rd space; a space that already existed before a downgrade (or that predates a cap change) stays fully editable forever, silently breaking that promise and the exact copy shown in `PricingView`'s FAQ ("Spaces and items beyond the Free limits become read-only until you're back under the cap or upgrade again"). This item is scoped to the **space** as the unit of read-only-ness: which whole spaces are over-cap, not zone/item overage *within* an otherwise-editable space (that remains covered by the existing add-guards). No server-side enforcement is added — this is a client-side presentation/UX correctness fix; a determined user editing the API directly is out of scope, tracked separately.

### 🔑 Core Functional Areas
- Deterministic selection of which spaces are "the over-cap ones"
- Read-only badge/messaging on the dashboard and inside an open space
- Disabling mutating affordances on a read-only space (rename, items, zones, layout editor)
- Delete remains available as the recovery path back under the cap
- Live re-evaluation on upgrade/downgrade and after any count-changing action (no stale/lingering flag)
- No regression to the existing add-past-cap paywall guards

---

### Functional Requirements

**Deterministic over-cap selection**

- **FR-1**: The system must derive, for every loaded space, whether it is "read-only due to the space cap" from the plan's `caps.spaces` and the space's position in the account's stable space ordering (the same order the dashboard already lists spaces in, driven by the server's stable `GetSpaces` ordering) — the first `caps.spaces` spaces in that order are editable; every space after that is read-only. On Pro (`caps.spaces` unbounded), no space is ever flagged.
  - *Business rationale*: The FAQ's promise only means anything if the *same* spaces are read-only on every load — a flag that shuffles per render or per session would look like data corruption, not a plan boundary.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free only; derives from `reason: 'spaces'`. No new paywall trigger — this is a passive flag, not a blocked mutation.
  - *Constraints/Rules*: Must be computed from data already available to the dashboard (no extra fetch). Must re-derive live off the current space count and plan — never snapshotted at the moment of downgrade — so deleting an over-cap space or upgrading immediately changes which spaces (if any) are flagged, with no separate "unlock" step.
  - *Acceptance criteria*: With 2 loaded Free-plan spaces, none are read-only. With 5 loaded Free-plan spaces, spaces 3–5 (by existing list order) are read-only on every reload/re-render; spaces 1–2 are not. Switching the account to Pro clears every read-only flag without a page reload.

**Read-only badge & messaging**

- **FR-2**: A read-only space is badged "Read-only — upgrade to edit" on its dashboard card (`SpaceCard`) and, on open, within the space itself (near `SpaceHeader`).
  - *Business rationale*: Users must understand *why* actions are missing before they hit a dead end — an unexplained disabled button reads as a bug.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free only, over-cap spaces.
  - *Constraints/Rules*: Badge text is exactly "Read-only — upgrade to edit" per the acceptance criteria; visually distinct from (not confused with) the existing "at limit" upsell banner, which is about the cap generally, not this specific space.
  - *Acceptance criteria*: Every space flagged read-only (FR-1) shows the badge on its dashboard card. Opening that space shows the same message near the top of the view. No badge appears on an editable space or on any space while on Pro.

**Disabling mutating affordances**

- **FR-3**: On a read-only space's dashboard card, the "Rename" action is disabled (or removed) from the card's action menu.
  - *Business rationale*: Renaming is content edit, not viewing — must match the read-only promise.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free only, over-cap spaces.
  - *Constraints/Rules*: "Open" (viewing) and "Delete" stay available (see FR-6) — only content-changing actions are affected.
  - *Acceptance criteria*: Attempting to rename a read-only space is not possible from the dashboard; the rename modal never opens for it (or opens but a disabled-state is visually obvious — implementer's choice, but no successful rename can occur).

- **FR-4**: Inside an open read-only space, every content-mutating affordance is disabled: adding an item (Smart Add), editing or removing an existing item, entering the layout editor to add/edit/delete a zone or convert canvas mode, and viewing item photos (already covered by the separate `photos` gate, unaffected here).
  - *Business rationale*: This is the core of the promise — a read-only space must behave read-only everywhere a user can reach a mutation, not just on the one screen someone remembered to gate.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free only, over-cap spaces. Not a new paywall `reason` — clicking a disabled affordance does nothing (or, where a control can't easily be hidden/disabled in place, opens the paywall with `reason: 'spaces'` as a fallback explanation).
  - *Constraints/Rules*: Viewing is unaffected — list view, layout view (non-edit), item detail (read), and switching between list/layout display mode all keep working normally on a read-only space, since they don't change content. Only entry into the zone/layout *editor* and item add/edit/remove are blocked.
  - *Acceptance criteria*: On a read-only space: Smart Add is disabled/hidden; item detail's "Edit" and "Remove" controls are disabled/hidden; the layout view's "Edit" (enter editor) control is disabled/hidden; no item or zone mutation succeeds via any UI path. Switching between List/Layout display and opening item detail to *view* an item still work.

- **FR-5**: A read-only space's over-cap status never blocks navigation or reading — the space still opens, its items/zones/expiry states still render, and it still counts toward "your spaces" totals and any expiry-soon/expired surfacing.
  - *Business rationale*: "Read-only," not "hidden" or "frozen" — users must still be able to see what's inside for consult/inventory purposes (e.g. checking whether the freezer item recall applies).
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free, over-cap spaces.
  - *Constraints/Rules*: None of FR-1's flag affects fetch/load behavior (`loadSpaceContents`, pagination) — it is purely a presentation/interaction-gating flag layered on top.
  - *Acceptance criteria*: A read-only space opens normally from the dashboard and its full contents render in both list and layout view.

**Delete stays available (the recovery path)**

- **FR-6**: Deleting a read-only space remains fully available and unaffected by this item.
  - *Business rationale*: The FAQ explicitly promises editability returns once "you're back under the cap" — deleting an over-cap space is the only in-product way to get there without paying, so blocking delete would contradict the product's own stated recovery path.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free, over-cap spaces — delete is never gated by any cap (matches existing behavior: `handleDeleteError` never opens a paywall).
  - *Constraints/Rules*: Deleting a read-only space re-evaluates every remaining space's read-only flag immediately per FR-1 (no manual refresh needed) — deleting the 3rd of 3 over-cap spaces on Free (cap 2) leaves exactly the 2 remaining spaces editable.
  - *Acceptance criteria*: A read-only space can be deleted from the dashboard exactly as any other space. After deleting down to `caps.spaces` or fewer spaces, no space shows the read-only badge.

**Upgrade round-trip**

- **FR-7**: Upgrading from Free back to Pro immediately restores full editability to every previously read-only space, with no lingering read-only state or stale badge.
  - *Business rationale*: Paying for Pro must feel instant — a user who just upgraded and still sees "Read-only" on a space they're paying to unlock will assume the upgrade failed.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Pro — `caps.spaces` becomes unbounded, so FR-1's flag naturally clears for every space with no separate code path to maintain.
  - *Constraints/Rules*: Must not require a page reload or re-fetch of spaces to clear — it is a computed flag over `session.caps` + the existing spaces list, both already reactive.
  - *Acceptance criteria*: Starting from N read-only spaces on Free, switching the account to Pro (via the existing plan-change flow) clears every badge and re-enables every affordance in the same session, without navigating away or reloading.

**No regression to existing guards**

- **FR-8**: The existing add-past-cap guards (`checkAddSpace`, `checkAddZone`, `checkAddItem`, the dashboard's locked "New space" tile, the at-limit upsell banner) continue to function unchanged for spaces that are *not* over the space cap.
  - *Business rationale*: This item adds a new gate; it must not weaken or duplicate the ones that already work correctly.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A — regression guard.
  - *Constraints/Rules*: An editable (non-over-cap) space's own zone/item caps are unaffected by this item — a Free space with 6 zones already blocks a 7th exactly as today, whether or not the account also has an over-cap 3rd space.
  - *Acceptance criteria*: All existing paywall-guard behavior (adding a space at the cap, adding a zone/item at their per-space caps) still opens the correct paywall `reason` and still blocks the mutation, on both editable and read-only spaces alike.

---

### ⚠️ Key Business Considerations
- **Trust in the FAQ's own words.** `PricingView` already tells users this happens — shipping the enforcement closes a real "the app lied to me" risk, not a hypothetical one.
- **Read-only ≠ hidden.** Users must be able to keep consulting an over-cap space (what's in it, what's expiring) even though they can't change it — this is inventory data they may still need day-to-day.
- **Non-destructive by design.** Nothing about this item deletes or hides data; it only removes the ability to *change* it, and only until the user either upgrades or deletes something else — both fully reversible states.
- **Determinism is the crux.** Any sort that isn't stable across reloads (e.g. accidentally keying off array insertion order after a local mutation) will make different spaces "randomly" read-only between sessions, which is worse than not building this at all.

### 🚫 Out of Scope (Phase 1)
- Server-side enforcement of read-only spaces (separate, tracked concern per task notes — a determined user could still mutate via direct API calls).
- Per-zone/per-item read-only flags for zones/items that individually exceed their own caps *inside an editable, under-cap space* — only whole-space over-cap status is addressed here.
- Any new copy/flow explaining *why* a particular space (vs. another) was chosen as the read-only one beyond the badge text itself.
- Changing which action the "New space" locked tile or at-limit banner point to — those are unaffected by this item.

### ❓ Open Questions for Product Owner
1. Should "Duplicate" be disabled/hidden on a read-only space's card, or is it acceptable to leave it clickable and let the existing `checkAddSpace` paywall catch it on attempt (since duplicating from an over-cap account will almost always also be at/over the cap)? Assumption for this doc: leave it as-is (falls through to the existing paywall) since duplicate creates a *new* space, not an edit to the read-only one, and disabling it adds UI complexity for a rare path.
2. Is the "Read-only — upgrade to edit" badge's upgrade path expected to be a link/button straight to the paywall or pricing page, or purely informational text? Assumption: informational text is sufficient for Phase 1; a direct CTA can follow if the product owner wants it.
3. Confirm the "stable order" used to pick which spaces are over-cap should be the same order the dashboard already renders spaces in (server list order) rather than, say, most-recently-created-first — the latter would mean newly upgraded-then-downgraded accounts keep different spaces editable each time, which seems less predictable to a user than "the first N in your list."
