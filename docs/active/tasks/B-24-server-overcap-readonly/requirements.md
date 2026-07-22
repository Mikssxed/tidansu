### 📋 Backlog Item
After a Pro→Free downgrade, the API itself must reject content-mutating requests against a space that is over the Free space cap — today only the SPA hides those affordances, so a user calling the endpoints directly can still edit a space the product promises is read-only.

### 🎯 Product Context Summary
Tidansu's rule is "downgrade keeps data but makes over-cap content read-only" — B-17 already delivers the SPA half (badges, disabled controls) for whichever spaces sit beyond `caps.spaces` in the account's stable space ordering. That SPA gate is presentation only: it protects the honest user from an accident, not the account from a deliberate bypass. This item makes the same rule a real authorization boundary on the server — the last line of defense for the product's own stated promise (and the FAQ copy in `PricingView` that describes it). It must select the *exact same* over-cap spaces the SPA already shows as read-only, or the two surfaces will visibly disagree with each other.

### 🔑 Core Functional Areas
- Deterministic server-side over-cap space determination, identical to the SPA's rule
- Rejecting content mutations (space rename/settings, zone add/update, item add/update) targeting an over-cap space
- Deciding whether zone/item *removal* inside an over-cap space is also blocked, for consistency with what the SPA already disables
- Preserving whole-space delete as the unblocked recovery path back under the cap
- Surfacing the existing `reason: 'spaces'` plan-limit error shape the SPA already knows how to render
- No behavior change for Pro users or for Free users' under-cap spaces
- No regression to the separate, already-correct per-space zone/item count gates (`CheckAddZone`/`CheckAddItem`)

---

### Functional Requirements

**Deterministic over-cap space determination**

- **FR-1**: For any content-mutating request naming a target space, the system must be able to determine — from the requesting user's plan and their account-wide space ordering — whether that specific space is one of the over-cap spaces, using the identical rule the SPA already uses to badge it: order the account's spaces by their stable `Id`, and treat every space beyond position `caps.spaces` as over-cap. On Pro, no space is ever over-cap.
  - *Business rationale*: If server and SPA ever disagree on which spaces are read-only, the product looks broken in the worst way — a user sees one space badged read-only and edits a *different* space successfully, or vice versa.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free only. Not itself a paywall trigger — it's the classification a mutation check consults.
  - *Constraints/Rules*: Must reuse the same ordering and the same `caps.spaces` value the space-creation gate and the dashboard listing already use — this is not a second, independently invented definition of "over-cap." Must be evaluated fresh on every request (live against current plan + current space count), never cached or snapshotted from the moment of downgrade, so that deleting a space or upgrading immediately restores editability with no separate unlock step.
  - *Acceptance criteria*: For a Free account with spaces `S1..S5` (created in that order, `caps.spaces = 2`), a mutation against `S1` or `S2` is evaluated as under-cap; a mutation against `S3`, `S4`, or `S5` is evaluated as over-cap. Deleting `S3` re-evaluates `S4`/`S5`'s status on the very next request with no separate step.

**Rejecting content mutations on over-cap spaces**

- **FR-2**: A Free-plan user's request to rename or otherwise update a space's own settings (name, view mode, canvas mode, layout columns/labels) is rejected when that space is over-cap per FR-1.
  - *Business rationale*: Renaming/reconfiguring a space is a content edit exactly like the SPA already disables it for — the server must back that up, not just the button being greyed out.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free, over-cap space; fires paywall `reason: 'spaces'`. Pro and under-cap Free spaces unaffected.
  - *Constraints/Rules*: This is a new, space-cap-specific gate — it must not be confused with or folded into the existing zone/item per-space count gates, which are deliberately un-gated on update (see `PlanPolicy`'s documented "updates/deletes are not gated" rule for *those* caps). This gate answers a different question ("is the space itself one of the account's excess spaces?"), not "does this space have too many zones/items?".
  - *Acceptance criteria*: Calling the space-update action directly against an over-cap space, as a Free user, returns the plan-limit rejection with `reason: 'spaces'` and the space's stored settings are unchanged. The identical call against an under-cap Free space or any Pro space succeeds as today.

- **FR-3**: A Free-plan user's request to add a zone, add an item, update an existing zone, or update an existing item is rejected when the request targets a space that is over-cap per FR-1.
  - *Business rationale*: This is the core of the bypass this item exists to close — a user could otherwise keep growing or editing an over-cap space's contents indefinitely while its dashboard card says "read-only."
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free, over-cap space; fires paywall `reason: 'spaces'`. This fires *in addition to*, not instead of, the existing zone/item count-cap checks — a mutation can be rejected for either reason depending on which applies; the over-cap-space check should be evaluated regardless of whether the space's own zone/item counts are themselves within their per-space caps.
  - *Constraints/Rules*: Ownership/not-found checks (a space that doesn't belong to the caller, or doesn't exist) must still take precedence over this new rejection, exactly as they do for every other gate today — a user must never learn "this space is over-cap" about a space that isn't theirs.
  - *Acceptance criteria*: As a Free user with an over-cap space, adding a zone, adding an item, updating an existing zone's fields, or updating an existing item's fields against that space is rejected with `reason: 'spaces'` and no data changes. The same operations against an under-cap Free space or a Pro space are unaffected.

- **FR-4**: Removing an existing zone or item from an over-cap space is also rejected for a Free-plan user, matching the SPA's own affordance-disabling (B-17 disables zone/item removal inside a read-only space, not only add/edit).
  - *Business rationale*: "Read-only" means the space's contents can't be changed at all — allowing removal while blocking add/edit would be an inconsistent, half-enforced rule that a determined user could still exploit to reduce a space's content out from under the intended read-only guarantee (e.g. clearing it down before an eventual delete without ever deleting the space itself).
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free, over-cap space; fires paywall `reason: 'spaces'`.
  - *Constraints/Rules*: Deleting the **space itself** is explicitly exempt from this rule (see FR-5) — this FR is scoped to removing a zone or item *within* a space that continues to exist.
  - *Acceptance criteria*: As a Free user with an over-cap space, removing a zone or removing an item from that space is rejected with `reason: 'spaces'`; the zone/item remains in place. The identical removal on an under-cap Free space or a Pro space succeeds as today.

**Delete stays the recovery path**

- **FR-5**: Deleting an over-cap space is never blocked by this item, for any plan.
  - *Business rationale*: Deleting an over-cap space is the only in-product way a Free user gets back under the cap without upgrading — the product's own promise is "read-only until you're back under the cap or upgrade," and blocking the one action that satisfies "back under the cap" would contradict that promise outright.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: All plans, all spaces — delete is never cap-gated (matches existing behavior).
  - *Constraints/Rules*: No new rule may be introduced anywhere in this item's implementation that touches the delete-space path.
  - *Acceptance criteria*: A Free user can delete any of their spaces, over-cap or not, with the same outcome as today. Deleting an over-cap space down to `caps.spaces` or fewer immediately makes every remaining space evaluate as under-cap on the next request (per FR-1).

**Consistent, SPA-compatible rejection shape**

- **FR-6**: Every rejection introduced by this item uses the existing plan-limit error shape with `reason: 'spaces'` — the same shape and reason the SPA already interprets to open its "spaces" paywall.
  - *Business rationale*: The SPA must not need new error-handling code to cope with server-side enforcement catching up to what it already displays; a mismatched error shape would either crash the request or silently show the wrong paywall messaging.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A — cross-cutting to FR-2/3/4.
  - *Constraints/Rules*: Must reuse the existing plan-limit reason value for "spaces," not introduce a new or differently-spelled reason.
  - *Acceptance criteria*: Every rejection produced by FR-2/3/4 is observably identical in shape to the existing plan-limit rejections a Free user already gets from, e.g., creating a 3rd space at the cap — same error family, `reason: 'spaces'`.

**No regression to unrelated plan gates**

- **FR-7**: Existing plan-limit checks unrelated to whole-space over-cap status — the per-space zone cap, the per-space item cap, the account-wide space-creation cap, and the photos/sync capability gates — continue to behave exactly as before this item, on both over-cap and under-cap spaces alike.
  - *Business rationale*: This item adds one new authorization boundary; it must not weaken, duplicate, or change the timing of the ones that already correctly protect the product today.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A — regression guard.
  - *Constraints/Rules*: In particular, the deliberate "zone/item updates and deletes are not cap-gated" rule for a space's *own* zone/item counts (an under-cap, editable space with 8/6 zones stays editable) must remain true — this item's new gate is about whether the *space itself* is one of the account's excess spaces, an orthogonal question.
  - *Acceptance criteria*: All existing plan-limit rejection behavior (space creation at cap, zone/item creation at their per-space caps, photo/sync capability gates) is unchanged for spaces this item does not affect.

---

### ⚠️ Key Business Considerations
- **Parity with the SPA is the whole point.** Any drift between which spaces the dashboard badges read-only and which spaces the server actually blocks turns a trust-building feature into a confusing bug report.
- **This closes a real access-control gap, not a defense-in-depth nicety.** Until this ships, B-17 only stops accidental edits through the UI — a user who knows (or discovers) the endpoints can freely ignore the read-only promise.
- **Non-destructive and fully reversible, same as B-17.** Nothing here deletes or hides data; it only refuses to let it change, and only for as long as the account stays over the space cap.
- **Two independent gates must not blur together.** The existing zone/item per-space count caps and this item's whole-space over-cap gate answer different questions and must be reasoned about (and tested) separately — conflating them risks silently reintroducing the exact bug the codebase's `PlanPolicy` comments warn against (rejecting an ordinary update/delete that was never meant to be capped).

### 🚫 Out of Scope (Phase 1)
- Any change to which spaces are selected as over-cap versus the SPA's existing rule (this item consumes that rule, it does not redefine it).
- Any new user-facing messaging beyond the existing plan-limit paywall the SPA already renders for `reason: 'spaces'`.
- Rate-limiting, logging, or alerting on repeated bypass attempts (a deliberate abuse pattern is a separate, later concern if it ever materializes).
- Any change to the per-space zone/item count gates (`CheckAddZone`/`CheckAddItem`) or their deliberately un-gated update/delete behavior.

### ❓ Open Questions for Product Owner
1. FR-4 (blocking zone/item *removal* inside an over-cap space, not just add/update) goes slightly beyond the task brief's literal wording ("space update, zone/item create/update"), but matches what B-17's SPA already disables (item removal, zone deletion via the layout editor). Confirm removal should also be rejected server-side — the alternative (leaving removal open) would mean a Free user can still shrink an over-cap space's contents via direct API calls even though the SPA hides that control, which seems like an inconsistency worth closing while this gate is being built anyway. Assumption for this doc: block it.
2. Should a rejected mutation attempt against an over-cap space be logged distinctly from an ordinary plan-limit rejection (e.g. to help spot accounts probing the API after a downgrade)? Assumption: no special logging beyond whatever the existing plan-limit rejections already produce — this is a correctness fix, not a security-monitoring feature.
3. Confirm there is no product expectation of a grace period (e.g. "read-only takes effect N days after downgrade") — this document assumes the rule is fully live immediately on every request, matching B-17's immediate client-side behavior.
