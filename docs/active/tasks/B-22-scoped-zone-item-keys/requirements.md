### 📋 Backlog Item
Zone and item identifiers are currently unique across the whole system rather than
scoped to the space that owns them, so one account can predict and squat on the
small set of ids the client's clock-based generator produces, causing other
users' first zone/item add to fail with a server error and letting an outsider
probe whether an id exists anywhere in the system; this task scopes ids to their
owning space (composite key), maps any residual persistence collision to a clean
generic error, adds a defence-in-depth cap on how many zones/items one request
can carry, and must preserve every existing space's content through the
migration.

### 🎯 Product Context Summary
Tidansu's spatial model is Space → Zones → Items, and each user's spaces are
meant to be fully isolated from every other user's — nothing about the layout,
its zones, or its items should ever collide with, block, or reveal information
about someone else's storage. Today that isolation is broken at the identifier
level: zone/item ids are global, not per-space, so one tenant's activity can
break another tenant's ability to add a zone, and identifier collisions can leak
existence information across accounts. This is purely a trust/isolation fix —
it changes no plan limits, no paywall behaviour, and no zone/item feature
surface; the observable product promise after this ships is "your storage layout
is yours alone," verified by two independent users being able to use identical
zone/item ids with no error, and by every existing user's spaces rendering
exactly as before the upgrade.

### 🔑 Core Functional Areas
- Cross-tenant identifier isolation (composite key becomes user-visible as "no
  collisions, ever")
- Existence-oracle closure (a failed add must never reveal whether an id is
  taken elsewhere)
- Zero-loss migration of existing spaces, zones, items, and photos
- Defence-in-depth request-size cap on zone/item collections
- No regression to Free-plan caps, paywall reasons, B-15 granular endpoints, or
  B-16's slimmed read path

---

### Functional Requirements

**Cross-tenant identifier isolation**

- **FR-1**: Two different users — and two different spaces belonging to the
  *same* user — must each be able to hold a zone with an identical zone id, and
  an item with an identical item id, with no error and no visible interaction
  between them.
  - *Business rationale*: A user's storage is private to them; another
    account's activity (or even the user's own second space) must never
    constrain what ids they can use.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free and Pro identically — this is not a plan-gated
    capability, it is baseline correctness.
  - *Constraints/Rules*: Identifier uniqueness is scoped to the owning space,
    not global. This applies to zones and items alike; a zone id and an item id
    are never compared against each other's namespace either (unaffected by
    this change, but worth confirming no accidental cross-collision exists
    between the two entity types).
  - *Acceptance criteria*: Given user A has a zone with id `zone_1abc` in their
    space, user B (and user A's second space) can create a zone with the exact
    same id and see it appear correctly in their own layout, with user A's zone
    completely unaffected.

- **FR-2**: Adding a zone or item whose id happens to already be in use in
  *someone else's* space (or another of the same user's spaces) must succeed
  normally — it must never surface as a 500 or an unhandled persistence error.
  - *Business rationale*: Today this is the actual outage: predictable
    client-generated ids collide often enough that ordinary use (not just
    attack) can break another user's first zone-add.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free and Pro identically.
  - *Constraints/Rules*: Success here must be genuine — the same status code and
    resulting state as if the id were unique system-wide, not merely a
    swallowed error.
  - *Acceptance criteria*: Repeated adds across many accounts/spaces using the
    client's existing id generator produce zero collision failures in normal
    use; a targeted attempt to reuse another tenant's known id also succeeds
    without error.

**Existence-oracle closure**

- **FR-3**: The system must not let a caller distinguish "this id already
  exists in someone else's space" from "this id does not exist anywhere" via
  the response to an add/update request.
  - *Business rationale*: Even after the collision itself stops causing
    failures, any lingering error-shape difference could still leak whether an
    id is in use elsewhere, which is information about another account's data
    that must never be observable.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Not plan-gated.
  - *Constraints/Rules*: Any residual persistence-layer failure not prevented
    by scoping (e.g. a genuine data-integrity error) must be mapped to the same
    generic, non-identifying error response as any other unexpected failure —
    never a raw exception, and never a response shape that varies based on
    whether the colliding id belongs to another tenant.
  - *Acceptance criteria*: Submitting an add with an id known to exist in
    another user's space and submitting one with an id that exists nowhere
    both behave identically from the caller's point of view (same success, or
    if something does fail, the same generic error) — no 200-vs-500 or
    message-content difference between the two cases.

**Zero-loss migration**

- **FR-4**: Every zone and item that existed before this change — including
  its parent space, its position/size on the layout, and any attached photo —
  must still exist, unchanged, after the upgrade.
  - *Business rationale*: This is the single highest-risk user-visible outcome
    of the whole task; a user who logs in the day after this ships and finds
    part of their pantry or fridge layout missing, or a photo detached, is a
    trust-breaking failure this product cannot afford.
  - *Priority*: Phase 1 (Core) — this is a release-blocking gate, not a
    nice-to-have.
  - *Plan & gate*: Applies identically to Free and Pro data, including
    over-cap/read-only content carried over from a prior downgrade — read-only
    status itself must also be preserved, not reset.
  - *Constraints/Rules*: Every zone/item's relationship to its owning space
    must be preserved exactly (re-pointing any reference that depended on the
    old identifier scheme must not change which zone an item belongs to, nor
    which space a zone belongs to). Photo attachments must still resolve to the
    same item after migration.
  - *Acceptance criteria*:
    - For a representative sample of pre-migration spaces (at least one Free
      space at/under cap, one Free space with over-cap read-only content from a
      prior downgrade, and one Pro space with photos), the count of zones and
      items per space is identical before and after migration.
    - Every zone's position/size on its layout is pixel-identical before and
      after — the layout renders unchanged.
    - Every item's zone assignment, expiry date, and (Pro) attached photo are
      unchanged and correctly linked after migration.
    - The migration is verified against a snapshot of production-shaped data,
      not only an empty/dev database, before this ships.
    - If the migration cannot complete cleanly for any row, the migration fails
      loudly and does not partially apply — no silent data loss.

**Defence-in-depth request cap**

- **FR-5**: A single request that creates or replaces a space's zones/items
  must be rejected with a clean validation error if it carries more than a
  fixed, generous maximum number of zones or items — regardless of plan.
  - *Business rationale*: Today nothing bounds how many zone/item entries a
    single request can carry; combined with Pro's uncapped zone limit, an
    oversized request is both a resource-exhaustion risk and, before this
    task's key fix, the actual delivery mechanism for the identifier attack.
    This cap is a backstop independent of the key fix, not a replacement for
    plan limits.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Applies identically to Free and Pro — this is a request-size
    safety bound, not a plan feature; it must be set comfortably above any
    real Pro user's plausible zone/item count so it never fires for legitimate
    use. It is a distinct, additional check layered on top of (not instead of)
    the existing Free-plan `zones`/`items` paywall caps.
  - *Constraints/Rules*: Exceeding the cap must produce the same clean,
    structured validation-error shape the app already uses for other invalid
    input — never a 500, never a partial save.
  - *Acceptance criteria*: A request whose zone (or item) collection exceeds
    the configured maximum is rejected with a validation error identifying
    which collection and why; no data from that request is persisted; a
    request at or under the maximum is unaffected by this rule.

**No regression to existing plan/feature behaviour**

- **FR-6**: Free-plan zone and item caps continue to block the 7th zone in a
  space and the 51st item in a space exactly as before, opening the paywall
  with `reason: zones` or `reason: items` respectively, with no mutation
  applied when blocked.
  - *Business rationale*: This task must not weaken or shift plan-limit
    enforcement while fixing an unrelated isolation bug.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free: 6 zones/space, 50 items/space, paywall `reason: zones`
    / `reason: items` at the cap. Pro: unchanged (unlimited).
  - *Constraints/Rules*: The new defence-in-depth request cap (FR-5) must sit
    above the Free-plan limits and never itself become the mechanism by which
    a Free user is blocked before hitting their real paywall reason.
  - *Acceptance criteria*: A Free-plan space at 6 zones (or 50 items) still has
    its next add blocked with the correct paywall `reason`, unchanged from
    pre-task behaviour; Pro remains unaffected.

- **FR-7**: B-15's granular zone/item create, update, and delete endpoints
  continue to function against the new composite-key model, and B-16's
  slimmed read path (zone/item listing without full payloads) continues to
  return correct, correctly-scoped results.
  - *Business rationale*: This task changes how zones/items are identified at
    the storage level; every other feature that reads or writes a zone/item by
    id must keep working unchanged.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Not plan-specific; applies to all existing zone/item
    operations.
  - *Constraints/Rules*: Any endpoint that previously located a zone/item by id
    alone must now correctly resolve it within its owning space; cross-space
    id reuse (FR-1) must not cause an endpoint to accidentally operate on the
    wrong tenant's zone/item.
  - *Acceptance criteria*: Full frontend save/hydrate round-trip (create,
    edit, delete a zone; create, edit, delete an item; reload the space) works
    identically to pre-task behaviour for both a Free and a Pro test space, and
    for two spaces (different users or same user) that deliberately share zone
    and item ids.

---

### ⚠️ Key Business Considerations
- **Trust is the entire point of this task.** The product's core promise —
  "your layout, your data" — was silently broken; the fix must be verified,
  not assumed, especially the migration (FR-4) and the oracle closure (FR-3).
- **No feature or plan-limit surface should change.** Every observable
  behaviour outside of "collisions no longer happen" and "oversized requests
  get a clean error" should be identical to before this task.
- **The defence-in-depth cap must be invisible to legitimate use.** If set too
  low it becomes a de-facto Pro limit that was never decided as product policy;
  it must be validated against realistic large-Pro-space sizes before shipping.
- **Migration verification must use realistic data**, not just a clean dev
  database — the risk is entirely in existing, populated spaces.

### 🚫 Out of Scope (Phase 1)
- Reverting or altering B-15's granular endpoints or their rate-limiting
  posture (explicitly settled — not caused by B-15, not to be undone).
- Changing the client's id-generation scheme (`uid()` stays clock-derived;
  settled decision).
- Server-assigned ids or a CSPRNG id generator (both explicitly rejected at
  kickoff).
- Any change to plan/billing logic (B-9, B-10) or photo upload/serving (B-1)
  beyond ensuring the migration does not disturb stored photo blobs.
- Fixing `npm run build:api` (B-21) — if this task changes a DTO contract,
  Kiota regen uses B-21's documented workaround; B-21 itself is untouched.

### ❓ Open Questions for Product Owner
- **Exact value for the defence-in-depth zone/item collection cap.** Needs a
  number generous enough never to affect a real Pro power-user's space but
  tight enough to bound request cost — recommend grounding it against the
  largest realistic layout (e.g. a large pantry/cellar with dozens of zones and
  a few hundred items) rather than picking an arbitrary round number. Tech-lead
  should propose a concrete figure informed by payload-size math and confirm
  with product owner before shipping.
- **Migration verification data source.** Confirm whether a production (or
  production-shaped) data snapshot is available to rehearse the migration
  against, or whether a synthetic dataset must be constructed to stand in for
  "representative pre-migration spaces" in FR-4's acceptance criteria.
- **Rollback posture.** If the data migration is found to be unsafe partway
  through a production run, is a rollback path required, or is a forward-fix
  posture acceptable given the target is a pre-launch/low-traffic system? This
  affects how cautious the migration script itself needs to be.
