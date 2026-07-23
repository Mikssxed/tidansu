### 📋 Backlog Item
Make the SPA's over-cap (read-only) space badging select exactly the same set of spaces the server freezes on downgrade, instead of the current array-position slice.

### 🎯 Product Context Summary
When a Pro account downgrades to Free with more than 2 spaces, the server (B-24) keeps the account's data but makes `total - 2` spaces read-only, choosing that set deterministically by `Space.Id` order — the same tie-break the list endpoint already returns spaces in. The SPA badges "read-only" by slicing the store's array at position `caps.spaces` (`useLimits.ts`), which assumed array order tracked `Id` order. B-23 made `Space.Id` server-assigned/random and `reconcileSpaceId` doesn't re-sort, so the two orders can now diverge: the badge is cosmetic-but-wrong, not a security hole (server enforcement is independent and correct), but it actively misleads the user about which spaces they can still edit.

### 🔑 Core Functional Areas
- Over-cap badge selection must agree with server enforcement
- No change to enforcement, caps, or paywall behavior

---

### Functional Requirements

- **FR-1**: The set of spaces shown as read-only/over-cap must be exactly the set whose mutations the server will reject, for any store/array ordering.
  - *Business rationale*: A wrong badge sends the user to edit a space that 403s (frustrating, looks broken) or leaves them thinking an editable space is locked (avoided data entry).
  - *Priority*: Phase 1 (light-path fix)
  - *Plan & gate*: Free-only symptom (surfaces after Pro→Free downgrade with >2 spaces); no gate/reason changes.
  - *Constraints/Rules*: Kept (editable) spaces = the first `caps.spaces` spaces ordered by `Id` — same tie-break as the server's `OrderBy(s => s.Id)`. This must hold regardless of the order spaces were created, fetched, or reconciled into the store.
  - *Acceptance criteria*: On a downgraded multi-space account, the badged spaces are exactly those whose edit/delete/rename attempts return 403; unbadged spaces all succeed.

- **FR-2**: The normal (non-over-cap) list order the user sees must not change as a side effect of this fix.
  - *Business rationale*: Users navigate spaces by their familiar order; re-sorting the visible list to fix badging would be a confusing regression.
  - *Priority*: Phase 1
  - *Plan & gate*: N/A
  - *Constraints/Rules*: Badge selection may use `Id` order internally, but the space list/grid display order is unaffected.
  - *Acceptance criteria*: Space display order before and after the fix is unchanged for a given account state.

- **FR-3**: Badging stays live and correct through the actions that already trigger it — downgrade, upgrade, space add, space delete.
  - *Business rationale*: This is an existing guarantee (see B-17) that must survive the fix, not just the initial-load case.
  - *Priority*: Phase 1
  - *Plan & gate*: N/A
  - *Constraints/Rules*: No new "unlock" step or manual refresh required.
  - *Acceptance criteria*: Toggling plan or adding/removing a space immediately re-derives the correct badge set without a page reload.

---

### ⚠️ Key Business Considerations
Server enforcement is already correct and authoritative — this is purely a trust/clarity fix so the UI doesn't contradict the server. Get it wrong in the other direction (e.g. badge set drifts again after some future ordering change) and users lose confidence in the app's honesty about what they can touch.

### 🚫 Out of Scope (Phase 1)
No changes to plan caps, paywall reasons, downgrade/read-only enforcement logic, or the space list's user-facing sort order.

### ❓ Open Questions for Product Owner
- None blocking — the fix direction (badge selection keyed to the same `Id` order the server uses, decoupled from array/display position) is already specified in the task notes; left to tech-planning to decide the exact mechanism.

### Verification path
1. Sign in as Pro, create 3+ spaces.
2. Downgrade to Free (cap = 2 spaces).
3. Confirm the SPA badges exactly `total - 2` spaces as read-only, and that set matches `OrderBy(Id)` tail — not array/creation position.
4. Attempt to edit each space: badged spaces 403, unbadged spaces succeed.
5. Add a space, delete a space, upgrade back to Pro — confirm badging updates immediately and correctly at each step, with no change to display order.
