### 📋 Backlog Item
A space id can currently collide across tenants and is client-supplied with low
entropy, letting one account (particularly an unlimited-space Pro account) squat
the id range and force another tenant's first space creation to fail — the same
cross-tenant denial-of-service and existence-oracle bug B-22 closed for zones and
items, but still fully open on `Space`, the tenancy root itself.

### 🎯 Product Context Summary
`Space` is the top of Tidansu's spatial model — the tenancy root that zones and
items hang off. Every user's very first action after signing up is creating a
space, so a bug that can make that specific action fail is maximally damaging to
trust and onboarding. This is not a new capability: it is closing a gap so that
one tenant's activity — malicious or accidental — can never affect what another
tenant sees, creates, or infers exists. There is no plan/paywall dimension to this
fix itself (it applies identically to Free and Pro accounts); the *attack* is
cheaper on Pro only because Pro has no space cap to slow bulk creation, so the
mitigating rate-limit requirement below applies regardless of plan.

### 🔑 Core Functional Areas
- Space identity/creation integrity (no cross-tenant id collision can break a mutation)
- Existence-oracle closure (no cross-tenant information leak via response status)
- Abuse-resistant space creation (rate limiting, independent of the id fix)
- Continuity for existing spaces and the current create/optimistic-add experience
- Migration safety for existing data

---

### Functional Requirements

**Cross-tenant space-id collision safety**

- **FR-1**: Creating a space must never fail because some other tenant, at any
  point in the past, already has a space identified the same way.
  - *Business rationale*: This is the core bug. A user's first-ever action in the
    product (creating their first space) must be reliable regardless of what
    other, unrelated accounts have done. A failure here is a hard onboarding
    blocker, not a cosmetic bug.
  - *Priority*: Phase 1 (Core) — this is the whole task.
  - *Plan & gate*: None (applies identically to Free and Pro). Not itself a
    paywall-relevant feature; existing `spaces` cap/paywall behaviour is
    unaffected and must keep working exactly as today.
  - *Constraints/Rules*: Two different tenants must be able to end up with
    "the same" space identifier (however identifiers end up being formed) without
    either tenant's create/update/delete ever erroring because of the other
    tenant's data. No behaviour may depend on global uniqueness of the identifier
    across tenants.
  - *Acceptance criteria*: Given tenant A already has a space with identifier X,
    when tenant B creates a new space using (or colliding with) identifier X,
    tenant B's creation succeeds normally and tenant A's space is completely
    unaffected (still exists, unchanged, still usable).

- **FR-2**: A space creation that is rejected for any identifier-related reason
  must fail as an ordinary, expected client-facing outcome — never as an
  unexpected/generic server error.
  - *Business rationale*: Even in an edge case where a collision is still
    possible (e.g. same user resubmitting), the user should get a clear, expected
    response rather than a confusing failure that looks like the app is broken.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: None.
  - *Constraints/Rules*: No identifier-collision scenario may surface as a
    generic unexpected-error response to the end user.
  - *Acceptance criteria*: Any reachable collision scenario results in a normal,
    documented client response (success, or a clear "try again"/validation-style
    message) — never the app's generic unexpected-error message.

**Existence-oracle closure**

- **FR-3**: A user must not be able to learn, by creating or attempting to
  create a space, whether some *specific* space (belonging to someone else)
  exists anywhere in the system.
  - *Business rationale*: Beyond the outage risk, this is a privacy/information-
    leak issue — today the success/failure split on creation silently reveals
    whether a specific identifier is "taken" by some other account, which is
    information no tenant should be able to extract about another.
  - *Priority*: Phase 1 (Core) — treated as its own claim, distinct from FR-1/2.
    (A fix that only prevents errors without also removing the differing signal
    would leave this open.)
  - *Plan & gate*: None.
  - *Constraints/Rules*: The response to a space-creation attempt must not vary
    (in status, body, or any observable signal) depending on whether an
    identifier happens to already be in use by another tenant versus never having
    been used by anyone.
  - *Acceptance criteria*: Submitting a space-creation request with an identifier
    known to exist in another tenant's account produces a response
    indistinguishable (status, body shape, timing-class) from submitting the same
    request with a guaranteed-unused identifier.

**Abuse-resistant space creation**

- **FR-4**: Space creation must be rate-limited per account, independent of the
  identifier fix.
  - *Business rationale*: Even once cross-tenant collision can no longer cause
    harm, unlimited unmetered space creation (today unrestricted, and structurally
    cheap on Pro since spaces are uncapped) is unwanted platform abuse — it can
    still be used to hammer the system, inflate storage, and generally represents
    open-ended free/low-cost resource consumption that has no legitimate user
    need behind it.
  - *Priority*: Phase 1 (Core) — called out explicitly in the source finding as
    required "independently of which [identifier fix] is chosen."
  - *Plan & gate*: None (a platform-abuse control, not a plan feature). Applies to
    Free and Pro alike; Pro's *legitimate* unlimited-spaces entitlement is about
    how many spaces a user may keep, not how fast they may create them.
  - *Constraints/Rules*: A reasonable per-account/per-time-window ceiling on space
    creation attempts, after which further attempts are rejected with a clear
    "slow down" response rather than processed.
  - *Acceptance criteria*: An account issuing a burst of space-creation requests
    beyond the defined window/threshold receives a clear rate-limit response for
    the excess requests; requests within the normal window are unaffected.

**Continuity for existing spaces and current UX**

- **FR-5**: Every space that exists today must continue to load, display, and
  accept edits/deletes exactly as before, with no visible change to any existing
  user.
  - *Business rationale*: This is a trust/hardening fix, not a feature — existing
    users must see zero disruption. Any migration must be transparent.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: None; applies uniformly, including to over-cap/read-only
    spaces left behind by a Free downgrade (B-17) — their read-only status and
    contents must be unaffected.
  - *Constraints/Rules*: No existing space, zone, item, or photo may be lost,
    duplicated, or reassigned to the wrong owner as a result of this change.
  - *Acceptance criteria*: For a representative sample of existing accounts
    (single-space Free, at-cap Free, over-cap read-only Free-after-downgrade,
    multi-space Pro with photos), every space is present, correctly owned,
    correctly editable/read-only as before, and its layout/contents are unchanged
    after the fix ships.

- **FR-6**: The experience of creating a space from the user's point of view
  (including any "appears immediately, syncs after" behaviour) must be preserved.
  - *Business rationale*: The current create flow may rely on the app showing a
    new space right away before the server confirms it. Whatever the eventual
    identifier approach, this perceived responsiveness must not regress.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: None.
  - *Constraints/Rules*: The user-visible sequence of "create a space → see it
    appear → it's usable" must not gain a noticeable delay or a new failure mode
    compared to today.
  - *Acceptance criteria*: Creating a space feels identical to a user testing
    before and after the fix — same perceived speed, no new error states
    introduced into that everyday flow.

---

### ⚠️ Key Business Considerations
- **This is a trust fix, not a feature.** Nothing here should be visible to a
  well-behaved user; success is invisibility. Any user-facing change (e.g. if the
  fix changes what a space "id" looks like or how it's assigned) must not leak
  into product surfaces as a regression.
- **Plan fairness is not in play here** — this fix does not touch the `spaces`
  paywall, cap enforcement, or downgrade read-only behaviour; those must be
  verified unchanged, not re-specified.
- **Same-plan protections must extend, not just the fix.** The `spaces` limit
  (Free: 2 spaces) and the rate limit are independent controls — closing the
  identifier bug does not substitute for either.
- **This item is one level up from B-22 and must not be assumed solved by it.**
  B-22's structural comments about "space-scoping" apply to `Zone`/`Item` only;
  this task addresses the entity B-22 never touched. Any documentation/comment
  claiming tenant isolation is "complete" repo-wide should be corrected as part
  of this work, not left as a trap for the next reader.
- **How the identifier problem gets solved (server-assigned/CSPRNG vs. keying by
  owner) is explicitly not decided here** — see Open Questions. Whichever is
  chosen, all requirements above (no cross-tenant collision, no oracle, no
  disruption to existing spaces, unchanged create-flow feel) must hold.

### 🚫 Out of Scope (Phase 1)
- Any change to the `spaces` plan cap (2 for Free, unlimited for Pro) or to
  paywall messaging/`reason` behaviour — unaffected by this fix.
- Any change to zone/item identifier handling — already addressed by B-22.
- General API-wide rate limiting strategy — only `POST` space-creation is in
  scope here; broader abuse controls on other endpoints are a separate concern.
- Cosmetic changes to how a space identifier is displayed anywhere in the UI (if
  the resolved approach changes identifier shape, that display concern belongs to
  tech-planning/downstream design, not this requirements slice).

### ❓ Open Questions for Product Owner
- **The identifier strategy itself is an open product/technical decision, not
  resolved by this document.** Two directions were identified: (a) the system
  assigns the space identifier itself, unrelated to anything the client sends;
  or (b) the client may still propose an identifier, but it only has to be
  unique to that account, not the whole system. Both satisfy every requirement
  above. This is left for the tech-lead/human to decide at the tech-planning
  gate, per the task brief's explicit instruction not to assume B-22's answer
  transfers. Whichever is picked must be checked against FR-6 (the optimistic
  "appears immediately" create experience), since option (a) may require the
  app to wait for the server's response before treating a new space as final.
- Is there an existing "reasonable" rate-limit shape elsewhere in the product
  (e.g. auth/billing endpoints) that space creation should match, or does this
  need its own threshold? (FR-4 needs a concrete window/count before
  tech-planning can size it.)
- Should the fix also apply retroactively to any already-colliding identifiers
  that might already exist in the data (if any were created before this fix,
  e.g. via a race), or is "no *new* collisions can cause harm" sufficient
  because the composite/owner-scoped read paths would already isolate them?
