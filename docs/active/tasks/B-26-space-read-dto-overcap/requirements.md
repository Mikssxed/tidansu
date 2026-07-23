### 📋 Backlog Item
Deep-linking straight into a single over-cap space (`GET /api/spaces/{id}`) shows no read-only badge until the spaces list has separately been fetched, because that endpoint's response DTO is also the create/update request body and can't safely carry a server-computed field — this item splits it into a read DTO and carries the over-cap flag on it, closing the gap B-25 deliberately deferred.

### 🎯 Product Context Summary
B-25 gave the spaces **list** the server's authoritative over-cap truth (`IsOverCap`), computed with the exact predicate (`PlanPolicy.CheckSpaceContentMutation`) that server-side enforcement (`SpaceOverCapGuard`) already uses on every mutation — so what the SPA badges as read-only after a downgrade is guaranteed to match what the server 403s. The **single-space read** (used for deep links, refresh, and direct navigation into a space) never went through the list and so never got the flag; a user landing there sees a fully-editable-looking space that will nonetheless 403 the moment they try to save. This item is purely a **badge-truth parity fix on the read path** — it does not touch enforcement (already correct) and must not touch the write path at all. The B-16 shared-DTO lesson (a single DTO used for both reading and writing lets a server-computed value get silently accepted/wiped on write) is exactly why B-25 deferred this: the fix requires giving the single-space **read** its own response shape, separate from the create/update **request** shape, so the over-cap flag has somewhere safe to live.

### 🔑 Core Functional Areas
- Over-cap badge truth on the single-space (deep-link) read path
- Isolation of the read response from the create/update request contract (no wipe-trap regression)
- Single source of truth for the over-cap predicate (no second, divergent rule)
- No regression to the B-25 list badge flow, plan paywalls, or space CRUD

---

### Functional Requirements

**Deep-link / direct-navigation badge truth**

- **FR-1**: When a user opens a space directly (deep link, browser refresh, or any navigation that loads a single space without first loading the spaces list), and that space is one of the account's over-cap (excess, read-only) spaces, the space must display its read-only state immediately — without waiting for a separate list fetch and without requiring a failed save first.
  - *Business rationale*: Today a downgraded user can open an over-cap space via a bookmark or refresh, see no warning, invest effort editing it (e.g. rearranging a layout, adding items), and only discover on save that the change is rejected. Immediate truth avoids wasted effort and confusion.
  - *Priority*: Phase 1 (Core) — this is the entire scope of the item.
  - *Plan & gate*: Applies only to Free-plan accounts currently over their space cap (post-downgrade with more spaces than the plan allows); Pro accounts and Free accounts within cap never see this state. No new paywall `reason` — this reuses the existing `spaces` reason surfaced when a mutation is attempted.
  - *Constraints/Rules*: The over-cap status shown must be computed by the exact same rule that already decides which spaces the server rejects mutations on (same rank order, same account-wide comparison) — there must be only one definition of "this space is over-cap" in the system, never a second read-path definition that could drift from enforcement.
  - *Acceptance criteria*: Deep-linking directly into an over-cap space (cold cache, list never fetched) shows the read-only badge/state on load. Deep-linking into a kept (non-over-cap) space shows it fully editable on load. The badged/unbadged set exactly matches which spaces the server accepts or rejects mutations on for that account, verified by attempting an edit on each.

**Write-path isolation (no shared-DTO wipe-trap regression)**

- **FR-2**: The create and update actions for a space must continue to accept exactly the fields a user is allowed to set, and must not accept, require, or be affected by the over-cap status in any way — a client cannot set, clear, or influence its own over-cap flag by sending one on a save.
  - *Business rationale*: Over-cap status is a server-computed consequence of plan and space count, not a property the user owns or edits. Letting it flow through a write path (even accidentally, by field presence) either lets a user forge their way out of read-only enforcement or — the B-16 failure mode — lets an unrelated save silently blank out data that a shared read/write shape happened to also carry.
  - *Priority*: Phase 1 (Core) — this is the safety rail the whole item exists to preserve.
  - *Plan & gate*: N/A (applies uniformly; not itself plan-gated).
  - *Constraints/Rules*: The shape used to describe "what you can send when creating/updating a space" must remain fully separate from the shape used to describe "what a space looks like when read back" — the over-cap flag must only ever appear on the read shape. Any regression that reintroduces a single shape for both reading and writing a space (or that lets a server-computed field be silently accepted or dropped on write) is a defect.
  - *Acceptance criteria*: Creating a space behaves identically to before this change (no new required/optional field on the create form or its rejection behaviour). Updating a space's editable fields (name, type, layout, zones, items) succeeds and persists exactly as before, with no observable change to what is saved or how validation errors surface. Sending an over-cap-flag-shaped value on a create/update request has no effect on stored data (ignored, not silently accepted as truth, not causing a wipe of unrelated fields).

**Enforcement/badge consistency (no second source of truth)**

- **FR-3**: The over-cap flag shown on a single-space read must be produced by the identical business rule already used (a) to decide which spaces the server rejects edits on, and (b) to badge the spaces list (B-25) — never a separately maintained or approximated rule.
  - *Business rationale*: The whole point of B-25 was closing a gap where the SPA's idea of "which spaces are read-only" disagreed with the server's actual enforcement. Introducing a third, independent read path for the single-space case reopens exactly that class of bug if it doesn't reuse the same rule.
  - *Priority*: Phase 1 (Core).
  - *Plan & gate*: N/A — this is a correctness rule about how the flag is derived, not a plan/gate rule itself.
  - *Constraints/Rules*: One rule, three consumers (mutation enforcement, list badge, single-space read badge) — the single-space read must not use ordering, counting, or comparison logic that could ever disagree with the other two, even under edge cases like ties in creation time or concurrent space creation/deletion.
  - *Acceptance criteria*: For every over-cap space in an account, the single-space read's badge state agrees with (a) that same space's badge state when it appears in the list, and (b) whether an edit attempt on that space is rejected. No account state exists where these three disagree.

**No regression to existing badge/CRUD flows**

- **FR-4**: The existing spaces-list over-cap badging (B-25), plan-cap paywalls (spaces/zones/items/photos/sync), and normal space create/update/delete flows must behave exactly as before this change for both Free and Pro accounts.
  - *Business rationale*: This item is a narrow parity fix; it must not destabilize the plan-limit enforcement the product depends on for monetisation fairness.
  - *Priority*: Phase 1 (Core).
  - *Plan & gate*: All plans; no change to any existing gate.
  - *Constraints/Rules*: None beyond "unchanged behaviour" for everything not explicitly listed in FR-1–FR-3.
  - *Acceptance criteria*: The full B-25 verification scenario (downgrade a multi-space account, confirm exactly the server's excess spaces badge on the list, confirm edits on badged spaces 403 and unbadged spaces save) still passes unmodified after this change ships.

---

### ⚠️ Key Business Considerations
- **Trust on first paint.** The core value of this fix is that a user should never see a false "editable" affordance on a space the server will actually reject — first impression must match reality, not just eventual reality after a background fetch.
- **Server stays sole authority.** This item only makes the badge *arrive earlier and more reliably*; it changes nothing about which spaces are actually locked. If the badge and the server ever disagreed, the server's 403 is still what protects data — this item narrows, but doesn't eliminate the need for, that backstop.
- **No new user-facing behaviour beyond the badge.** No new paywall copy, no new plan-limit rule, no new UI beyond making the existing read-only presentation appear reliably on deep link. Keep the surface area small given the low urgency/P3 priority already assigned.
- **Don't let the read/write split become an excuse to widen either shape.** The split exists solely to give the over-cap flag a safe home; it's not an invitation to add more read-only convenience fields onto the request shape or vice versa.

### 🚫 Out of Scope (Phase 1)
- Any change to which spaces are considered over-cap, how the cap is computed, or the ordering rule used to pick which spaces are "excess" (all settled by B-23/B-24/B-25).
- Sync-driven flag refresh triggers (explicitly deferred to a future sync item, per B-25's open question 2).
- Any new plan, cap, or paywall reason.
- Any UI/UX redesign of the read-only badge itself (its appearance is already defined; this item only makes it appear reliably on one more path).
- A dedicated "flags only" lightweight endpoint for refreshing badge state across many spaces at once — noted in B-25 as a possible future escalation, not needed here since this item concerns a single-space read.

### ❓ Open Questions for Product Owner
1. **Staleness tolerance on the single-space read.** The list badge (B-25) has an explicit freshness model (instant on upgrade, one round-trip refetch on downgrade/delete). For a single space loaded once via deep link with no polling, is it acceptable that the badge reflects the state *as of that load* and won't update live if the account's plan changes while the page stays open (the existing 403 backstop covers the actual save attempt regardless)? Assumed yes, consistent with how the rest of the app already treats point-in-time reads.
2. **Interaction with an already-open space during a downgrade.** If a user has a kept space open and then downgrades in another tab/device such that it becomes over-cap, should this item also make that already-loaded view flip to read-only, or is discovering that on next load/attempted save acceptable? Assumed out of scope here (belongs to the sync/live-refresh open question already deferred from B-25) unless the product owner wants it folded in.
3. **Priority confirmation.** This remains explicitly P3/low-urgency per B-25 and backlog — confirm it should proceed now rather than wait for a batch of similar low-urgency parity items.
