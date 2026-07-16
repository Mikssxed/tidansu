### 📋 Backlog Item
Replace the whole-space delete-all/re-insert save (triggered by the debounced
whole-space `PUT`) with granular per-zone and per-item mutation endpoints, so
editing one item or moving one zone costs a single-row change instead of
rewriting the entire space's zones, items, and photo blobs — this is the
route (b) chosen at kickoff over diffing inside the repository.

### 🎯 Product Context Summary
Tidansu's spatial model — space → zones → items — means most user actions
("rename this item", "nudge this shelf", "bump the quantity") touch exactly
one zone or item, not the whole space. Today the server can't tell the
difference: every edit resends and rewrites the entire graph, including every
photo ever attached, which is both a performance problem (write amplification
under load) and a data-integrity risk (a debounced batch that fails still
fails or succeeds as one unit, discarding unrelated edits). Moving to
granular endpoints makes "one edit = one write" true end to end, but it moves
today's single whole-graph plan-cap check to several smaller per-mutation
checks that must add up to the exact same guarantee — this is a rewrite of
real plan-gating logic, not a pure performance change, and it is the correct
place for the PM/tech-lead to spend the most care.

### 🔑 Core Functional Areas
- Granular zone mutations (add / update / remove)
- Granular item mutations (add / update / remove, including photo attach/replace/remove)
- Space-level (scalar) field updates, decoupled from the zones/items graph
- Plan-cap enforcement on the granular path, including concurrent-mutation safety
- Ownership and cross-user safety per mutated entity
- Autosave and partial-failure behaviour under independent per-entity saves
- Photo content validation on the new path
- Whole-space `PUT` transition (recommendation below)
- Non-regression of space create/delete, hydrate-on-boot, and account usage meters

---

### Functional Requirements

**Granular Zone Mutations**

- **FR-1**: A user can add a single zone to one of their spaces without the server touching any other zone or item in that space.
  - *Business rationale*: Drawing/adding one shelf is today's most common layout edit; it should cost proportional to itself.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free capped at 6 zones/space; on reaching the cap the paywall opens with `reason: zones` and the zone is not created. Pro unlimited.
  - *Constraints/Rules*: The new zone is attributed to the space the caller owns; it cannot be created against a space owned by another user (see Ownership section).
  - *Acceptance criteria*: Adding one zone to a 5-zone Free space succeeds and the space now shows 6 zones after reload. Adding a 7th zone to a 6-zone Free space is rejected, no zone appears, and the paywall opens with `reason: zones`.

- **FR-2**: A user can update a single zone's editable fields (label, colour, position/rect, kind, column assignment) without the server touching any other zone or item in that space.
  - *Business rationale*: Nudging or relabeling one shelf must not rewrite the other five and every item's photo.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free and Pro both allowed — editing an *existing* zone never changes the zone count, so it never trips the zones cap, even when the space is already over-cap after a downgrade (existing zones stay editable).
  - *Constraints/Rules*: The target zone must belong to a space the caller owns.
  - *Acceptance criteria*: Relabeling or repositioning one zone in a 50-zone Pro space (or an over-cap Free space) persists and survives reload; no other zone's stored data changes as a result.

- **FR-3**: A user can remove a single zone from one of their spaces. Removing a zone also removes every item placed inside it, matching today's product behaviour (a space never shows an item with no zone).
  - *Business rationale*: Deleting a shelf should feel instant and should not silently orphan the items that were on it.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Removal always reduces zone (and possibly item) counts, so it is never blocked by a cap on either plan.
  - *Constraints/Rules*: The target zone must belong to a space the caller owns. The cascade-removed items must disappear from the space's item list and item count in the same operation the user perceives as "delete this zone" — not as a separate visible step.
  - *Acceptance criteria*: Deleting a zone that contains 3 items removes the zone and all 3 items; after reload none of the 3 items exist and the space's item and zone counts both reflect the removal.

**Granular Item Mutations**

- **FR-4**: A user can add a single item to a zone without the server touching any other item or zone in that space.
  - *Business rationale*: "Smart add" and structured add are the highest-frequency actions in the app; each one should be its own cheap write.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free capped at 50 items/space; at cap the paywall opens with `reason: items` and the item is not created. If the new item carries a photo and the plan is Free, the paywall opens with `reason: photos` instead (photos gate before the items-count check would even matter, matching today's "photo blocks before content validation" ordering) — do not create the item in either case.
  - *Constraints/Rules*: The item's zone must belong to a space the caller owns.
  - *Acceptance criteria*: Adding a 51st item to a 50-item Free space is rejected with `reason: items` and no item appears. Adding any item with a photo on Free is rejected with `reason: photos`, even if the space is well under the items cap.

- **FR-5**: A user can update a single item's fields (name, zone assignment within the same space, quantity, tags, expiry, photo, slot/depth/level) without the server touching any other item or zone.
  - *Business rationale*: Renaming or moving one item — the motivating case for this task — must cost one row.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Editing an existing item's non-photo fields never trips the items cap (count is unchanged) and remains allowed even on an over-cap Free space. Adding a photo to an item that didn't previously have one, or replacing one, is gated by the photos capability (`reason: photos` on Free) exactly as it is for a new item; removing a photo is never blocked.
  - *Constraints/Rules*: The target item must belong to a space the caller owns; if the update reassigns the item to a different zone, that zone must belong to the same space. Moving an item to a different *space* is not supported (matches current model).
  - *Acceptance criteria*: Renaming/moving one item in a 50-item Free space (at cap) succeeds without touching the other 49. Attaching a photo to a previously photo-less item on Free is rejected with `reason: photos` and the item's other fields are unaffected. Removing a photo from an item on a downgraded, over-cap Free space succeeds.

- **FR-6**: A user can remove a single item from a space.
  - *Business rationale*: Consuming/discarding one item is the single most frequent destructive action in the app.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Removal always reduces item (and possibly photo) counts; never blocked on either plan.
  - *Constraints/Rules*: The target item must belong to a space the caller owns.
  - *Acceptance criteria*: Removing one item from a space leaves every other item and zone in that space untouched and persists after reload.

**Space-Level (Scalar) Field Updates**

- **FR-7**: A user can update a space's own fields — name, storage type, view mode, canvas mode, layout columns, column labels — without the request carrying (or the server rewriting) that space's zones or items.
  - *Business rationale*: Renaming a space or switching its view mode today re-sends and rewrites the entire zone/item graph purely as a side effect of how the save is batched; that amplification has nothing to do with the edit being made and must be closed by this task too, not just zone/item edits.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Not plan-gated (space count is checked at space *creation*, not on renaming/editing an existing space).
  - *Constraints/Rules*: The target space must be owned by the caller. This is the only remaining "space-level" write path once whole-space `PUT` is retired (see recommendation below).
  - *Acceptance criteria*: Renaming a space, or switching it from columns to freeform canvas mode, persists and survives reload without any zone or item row being rewritten.

**Plan-Cap Enforcement on the Granular Path**

- **FR-8**: Every zone-add, item-add, and photo-attach/replace mutation must independently enforce the same cap rule the whole-space check enforces today: reject only when the action would push the relevant count strictly above the plan's cap and strictly above what already exists (the downgrade "over-cap content stays read/write-editable but can't grow further" rule).
  - *Business rationale*: This is the crux of the task — decomposing one whole-graph check into several per-mutation checks must not create a gap where a sequence of small additions slips past a limit the equivalent whole-space edit would have caught.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free: 6 zones/space, 50 items/space, no photos; Pro: unlimited all three. `reason` ∈ {zones, items, photos} per the mutation kind.
  - *Constraints/Rules*: A Free user already over a cap after downgrading from Pro must be able to keep editing and removing their existing over-cap zones/items/photos, but any mutation that *adds* to an already-at-or-over-cap dimension must still be rejected. Rejected mutations must not partially apply (no zone/item row is created or altered when the guard fires).
  - *Acceptance criteria*: A downgraded Free space sitting at 8/6 zones lets the user rename or delete any of its zones, but adding a 9th zone is rejected with `reason: zones`. A Free space at exactly 50/50 items rejects one more item-add with `reason: items`; removing an item first, then adding, succeeds.

- **FR-9**: The zones-per-space and items-per-space caps must hold even when a user (or their client, e.g. two open tabs) fires multiple add-zone or add-item requests for the same space at the same time — the final count for that space must never exceed the plan's cap, regardless of how many concurrent requests were in flight.
  - *Business rationale*: The old whole-space check was one request, one atomic count; splitting into per-entity add calls reintroduces the same "two concurrent requests both read under-cap and both insert" race B-12 closed for space creation, but now inside every space on every add. Guaranteeing this is what makes the granular endpoints trustworthy, not just faster.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Applies to the zones and items caps on Free; Pro has no cap to race against.
  - *Constraints/Rules*: Exactly how the atomicity is achieved (locking, serialization, a database constraint) is a tech-lead decision — both approaches satisfy the same business guarantee and differ only in latency/retry trade-offs. The request that loses the race must receive the same `reason`-tagged paywall rejection as a normal cap-hit, not a distinct error or message (no special "someone else just took the last slot" UX — this is a narrow adversarial-concurrency edge case, not a scenario worth a bespoke user-facing message).
  - *Acceptance criteria*: Firing two simultaneous add-item requests against a Free space sitting at 49/50 items results in exactly one item created and one request rejected with `reason: items`; the space never ends the sequence above 50 items regardless of request ordering or timing.

**Ownership and Cross-User Safety**

- **FR-10**: Mutating a zone or item by id must never read or write another user's data, and must never let a caller distinguish "this id belongs to someone else" from "this id doesn't exist."
  - *Business rationale*: Per-entity ids replace the space-scoped whole-graph path as the primary way the server locates data to mutate; without an explicit ownership check on every one of them, a guessed or leaked id from another account becomes a direct read/write vector, and a status code that reveals "that id exists, it's just not yours" is itself an information leak.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Not plan-related.
  - *Constraints/Rules*: A zone or item id that is unknown, or that belongs to a space the caller does not own, must be treated identically — reported as "not found," matching the existing convention on the space-level endpoints (`GetByIdAsync` already filters by owner so a stranger's space and a nonexistent one look the same to the caller). Do not introduce a distinct "403 forbidden — not yours" response that would confirm the id's existence.
  - *Acceptance criteria*: A request to update or delete a zone/item id owned by a different user returns the same "not found" response, with the same body shape, as a request for a random/nonexistent id. Neither request causes any row to change.

**Autosave and Partial-Failure Behaviour**

- **FR-11**: A batch of rapid edits the user makes in one interaction window (e.g., renaming an item and nudging a zone within the same second) must be able to save independently — one edit failing (e.g., the item-add that pushes past the items cap) must not discard or revert edits that already succeeded.
  - *Business rationale*: Today's single whole-space `PUT` is all-or-nothing: if any part of a debounced batch would breach a cap, the entire batch — including unrelated, perfectly valid edits — fails together. Granular endpoints fix this as a side effect, and that improvement must be preserved deliberately, not lost by resyncing the whole space (or the whole account) on any single failure.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Applies uniformly; most relevant when a Free user is near a cap and mixes valid edits with one that trips it.
  - *Constraints/Rules*: On a rejected mutation, only that specific zone/item's optimistic local change is rolled back to the last known-good server state; sibling edits made in the same window that already succeeded remain saved and are not re-fetched away. The system must expose, per mutation, whether it succeeded, is still pending, or failed, so a later notification surface can tell the user precisely which edit needs attention — the notification UI itself is **out of scope** here (owned by B-19); this requirement is only that the underlying success/pending/failure state exists to feed it.
  - *Acceptance criteria*: A user renames item A (succeeds) and, in the same debounce window, tries to add a 51st item B to a full Free space (rejected, `reason: items`). After both requests settle, item A's rename is present on reload; item B does not exist; no other item or zone in the space was reverted or re-fetched.

**Photo Content Validation on the New Path**

- **FR-12**: Adding or updating an item's photo through the granular item endpoints must still be rejected with a named-field 400 when the photo is blank, malformed, not an allow-listed image type, or over the size cap — identical validation to today's whole-space path.
  - *Business rationale*: B-13's photo content validation is a security/content control, not an artifact of the whole-space save; it must not regress just because the entry point changed.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Only reachable on Pro (Free is already blocked by `reason: photos` before content is inspected — that ordering must be preserved: a Free user sending an invalid photo still gets the plan-gate rejection, never the validation 400).
  - *Constraints/Rules*: The validation error must name the specific item's photo field being rejected (matching today's `Space.Items[i].Photo` addressing, adapted to identify the one item in the request) and must never echo the photo's data back in the error message or logs.
  - *Acceptance criteria*: A Pro user attaching an oversized or non-image photo to one item gets a 400 naming that item's photo field; the item's other fields (and every other item/zone) are unchanged. A Free user attempting the same gets `reason: photos`, never the 400.

**Whole-Space `PUT` Transition**

- **FR-13**: The whole-space replace path (`PUT /api/spaces/{id}`, `UpdateSpaceCommandHandler`, `ReplaceAsync`) is retired as part of this task once the granular zone/item endpoints and the scalar space-update endpoint (FR-7) cover every edit the frontend currently sends through it.
  - *Business rationale*: See recommendation and reasoning below.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A — routing decision, not a new capability.
  - *Constraints/Rules*: Space creation (`POST /api/spaces`, whole-graph) and deletion are unaffected and out of scope — a brand-new space has no existing rows to amplify against, so the delete-all/re-insert cost this task exists to fix does not apply there.
  - *Acceptance criteria*: No production code path issues a whole-space delete-all/re-insert on an edit to an existing space; every store action in `useSpacesStore.ts` (rename, add/update/remove item, add/update/remove zone, view-mode/canvas-mode changes) is served by a granular or scalar-update endpoint.

---

### 🔧 Recommendation on the transition question
**Retire the whole-space `PUT` in this task rather than keeping it alongside the new endpoints.** Reasoning:
- Tidansu has exactly one API consumer (the SPA); there's no external integrator relying on the old contract, so the usual "deprecate before removing" caution doesn't apply.
- `useSpacesStore.ts` is already a listed touch point — every call site that uses the whole-space `PUT` must be rewritten to call the new endpoints regardless, so keeping the old endpoint alive doesn't save any frontend work; it only leaves a second, slower path reachable.
- Keeping both means maintaining **two parallel plan-cap enforcement implementations** (the existing whole-graph `before`/`after` diff in `PlanPolicy.CheckSpaceMutation`, and the new per-mutation checks) that must never be allowed to drift out of sync — that duplication is itself a correctness risk on the highest-risk part of this task, and it works against the acceptance criterion that renaming one item "no longer" triggers a full rewrite (a live PUT still capable of doing exactly that undermines the fix).
- The only real cost of retiring is a wider frontend diff in this one task — acceptable, since the frontend rewrite is required either way and the task already budgets for a Kiota regen.

### ⚠️ Key Business Considerations
- **Cap correctness is the deliverable, not a side effect.** The whole point of decomposing the check is that the sum of many small per-mutation checks must equal the one big check's guarantee, including under concurrency (FR-8, FR-9) and including the downgrade/read-only rule (existing over-cap content stays editable but can't grow). Any gap here is a paying-fairness bug, not a performance regression.
- **Ownership checks now happen per-entity, many more times per user session.** A single space-scoped ownership check becomes N zone/item ownership checks; a single missed one is a direct cross-user data leak (FR-10).
- **Partial-failure UX is a real behaviour change, not just internal plumbing.** Users will, for the first time, see "some of what I just did saved, some didn't" instead of "the whole save worked or didn't." That's an improvement (less lost work) but it must be represented faithfully to the user — this task must produce the underlying signal; B-19 designs the surface.
- **Photo validation and plan-gate ordering must survive the split.** Free-blocks-before-validation-inspects-content is a deliberate trust-boundary decision from B-13 and must be re-derived correctly for the single-item path, not just copy-pasted loosely.

### 🚫 Out of Scope (Phase 1)
- Paginating or slimming the spaces list, or moving photos off the row in `GET /api/spaces` — **B-16**.
- Designing the save-failure/partial-failure notification UI — **B-19** consumes the per-mutation success/pending/failure signal this task must expose (FR-11) but owns its presentation.
- Any change to space creation or deletion behaviour, or their existing plan-cap checks.
- Any change to the account usage meters (`GetAccountQueryHandler`, `UsageDto`) landed in **B-14** — the granular endpoints must keep those numbers correct but do not change how they're computed.
- Moving an item between spaces (not supported today; not introduced here).
- A distinct "you lost the concurrency race" user message (FR-9) — reuse the standard paywall rejection.

### ❓ Open Questions for Product Owner
1. **Whole-space `PUT` removal (see recommendation above).** Confirm removing it in this task, rather than keeping it as a fallback, is acceptable — the main trade-off is a larger frontend diff in this one task versus a longer window where two enforcement paths must stay in sync.
2. **Per-entity save timing.** Today all edits in a space are debounced together (400ms) into one request. Should each zone/item mutation debounce independently (so a rapid drag of one zone doesn't spam requests while an unrelated item edit elsewhere in the same space saves immediately), or should the client still batch same-space edits into a short window but send them as separate requests? This shapes how "partial failure" actually surfaces (FR-11) and is worth the PM/PO's input before tech-planning, since it's a UX timing choice, not purely a technical one.
3. **Zone-delete-with-items cascade (FR-3).** Confirmed as matching current behaviour (deleting a zone deletes its items) — flagging for explicit PO sign-off since it's now a named, testable server behaviour rather than an implicit consequence of resending the whole graph.
