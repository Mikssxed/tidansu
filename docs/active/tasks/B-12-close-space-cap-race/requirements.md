### 📋 Backlog Item
Close the Free-plan 2-space cap concurrency race (B-8 audit finding S-1): make
the space-creation limit hold even when a user fires several
`POST /api/spaces` requests at the same time, without changing anything about
how a single, normal request behaves.

### 🎯 Product Context Summary
Tidansu's Free plan is capped at 2 spaces; the cap is meant to be an absolute
ceiling that only Pro removes. Today the check-then-create is two separate
steps with a window between them, so a user (or a script) sending several
create requests back-to-back can slip more than 2 spaces past the gate before
any of them see the "you're at the limit" response. This is a **correctness
fix on an existing plan-gating surface**, not a new feature: no new UI, no new
paywall reason, no change to the single-request experience anyone already
knows. It is scoped as a **LIGHT-path hardening item** (see
`security-scalability-audit-b8` / `webhook-hardening-b9` precedent) — a short,
focused note rather than a full multi-phase FR document, because the desired
end-state is fully described by the task's acceptance criteria already.

### 🔑 Core Functional Areas
- Atomic enforcement of the Free 2-space cap under concurrent creation
- Consistent rejection behaviour for the request(s) that lose the race
- Non-regression of the normal single-request create flow and Pro (unlimited) creation

---

### Functional Requirements

**Atomic cap enforcement**
- **FR-1**: When multiple `POST /api/spaces` requests for the same Free-plan
  user are in flight at once, the system must guarantee that no more than 2
  spaces exist for that user afterward, regardless of how many requests were
  sent or how they interleave.
  - *Business rationale*: The 2-space cap is the product's line between Free
    and Pro. If it can be beaten by sending requests quickly, the plan
    boundary isn't trustworthy and Free users can silently get Pro-level
    storage for free.
  - *Priority*: Phase 1 (Core) — this *is* the whole item.
  - *Plan & gate*: Free; paywall `reason: spaces` (unchanged, existing
    value — no new reason introduced). Pro is explicitly out of scope for the
    guarantee (see FR-3).
  - *Constraints/Rules*: The count-check and the creation must be enforced as
    one atomic operation from the system's point of view — no window in which
    two concurrent requests can both observe "under the cap." The exact
    mechanism (locking, atomic constraint, retry-on-conflict) is a tech-lead
    decision; this requirement only fixes the *observable* guarantee.
  - *Acceptance criteria*: A Free user sitting at 1 space who fires N
    concurrent create requests ends up with exactly 2 spaces total, never 3+,
    no matter what N is or how the requests are timed. Repeated runs are
    consistent (no flaky pass/fail).

**Losing request(s) get a clean, expected rejection**
- **FR-2**: Every request that loses the race (i.e. would push the user over
  the cap) must be rejected with the same response a user already gets today
  for a normal over-cap create attempt — not a generic server error, not a
  silent no-op, not a duplicate/partial space.
  - *Business rationale*: A user (or the client retrying automatically) needs
    to be able to tell "you hit your plan limit" apart from "something broke."
    Surfacing a 500 here would look like a bug report waiting to happen, and a
    silent drop would leave the user confused about why their request
    "disappeared."
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free; same paywall `reason: spaces` response shape as the
    existing single-request cap rejection. No new error type.
  - *Constraints/Rules*: A request that loses the race must not leave behind
    a partially-created space, an orphaned zone/item, or a double-counted
    slot. If a request is rejected due to losing a race (as opposed to
    genuinely being submitted after the user was already at 2), the rejection
    should still be indistinguishable from an ordinary cap-hit to the caller —
    see Open Questions for whether the client should treat this as retryable.
  - *Acceptance criteria*: Every rejected concurrent request in the FR-1
    scenario returns the same status/body shape as today's normal "at cap"
    rejection (403, `plan: spaces`). No 500s, no hangs, no silently-dropped
    requests, no spaces left in a half-created state.

**No regression to existing behaviour**
- **FR-3**: The normal (non-concurrent) single-request create flow, the
  existing paywall `reason: spaces` UX, and Pro's unlimited space creation
  must all behave exactly as they do today.
  - *Business rationale*: This is a hardening fix, not a feature change — the
    overwhelming majority of create requests are single, sequential, and must
    see zero difference in behaviour, latency, or response shape. Regressing
    the common path to fix a rare race would be a net loss.
  - *Priority*: Phase 1 (Core) — required for this to ship as "hardening only."
  - *Plan & gate*: Free (capped, unchanged) and Pro (unlimited, unchanged;
    the fix must not introduce any new limit, delay, or failure mode for Pro
    users creating spaces back-to-back).
  - *Constraints/Rules*: No change to the paywall trigger conditions, no new
    paywall `reason`, no change to what a single successful create returns.
    Any added latency from the atomicity fix must be negligible for the
    normal single-request case.
  - *Acceptance criteria*: A Free user's single create request below the cap
    still succeeds identically to today. A Free user's single create request
    at the cap still gets the existing `reason: spaces` rejection. A Pro
    user firing many concurrent create requests ends up with all of them
    succeeding (no artificial serialization-induced failures).

**Observability when the race is actually hit**
- **FR-4**: When a create request is rejected *specifically because it lost the
  concurrency race* (as opposed to an ordinary at-cap rejection where the user
  was already at the limit before the request arrived), the system must emit a
  server-side signal (structured log entry at minimum) recording that the race
  fired, so the owner can see how often it happens in production.
  - *Business rationale*: Product owner decision at Gate 1 — we want visibility
    into whether this is a theoretical gap or a real, frequently-hit abuse path,
    to size how much further hardening (rate-limiting, etc.) is worth.
  - *Priority*: Phase 1 (Core) — small addition, ships with the fix.
  - *Constraints/Rules*: Must distinguish a race-lost rejection from a normal
    at-cap rejection in the signal (the ordinary "already at 2" case need not be
    logged as a race). The user-facing response is unchanged (FR-2) — this is a
    backend-only signal, no new user surface. Log at an appropriate level
    (e.g. `Information`/`Warning`), no PII beyond the user id already in logs.
  - *Acceptance criteria*: Reproducing the FR-1 concurrent scenario produces a
    log entry (or metric) for each request that lost the race; an ordinary
    single at-cap rejection does not spuriously emit the race signal.

---

### ⚠️ Key Business Considerations
- **Trust in the plan boundary.** This fix exists purely to make the Free/Pro
  line hold up under adversarial or accidental concurrency (e.g. a
  double-click, a flaky client retrying, or a deliberate script). Getting this
  wrong either lets Free users exceed the cap (revenue leak) or makes Pro
  creation flaky (support burden) — FR-3 exists to guard against the latter.
- **No new user-facing surface.** Because the observable contract (`reason:
  spaces`, same status code) doesn't change, there's nothing new for users to
  learn and no design/copy work needed — this should read as invisible to
  the vast majority of users who never hit the race window.
- **Deliberate-concurrency framing.** Per the B-8 audit note, triggering this
  in practice requires firing several requests near-simultaneously — it's a
  narrow but real gap (a scripted abuse case or an aggressive double-submit
  client bug), not something an ordinary user stumbles into by clicking twice
  slowly.

### 🚫 Out of Scope (Phase 1)
- Any change to the zones/items/photos/sync caps or their race conditions
  (this item is scoped to the space cap only; if the same class of bug exists
  for zones/items, that's a separate follow-up, not bundled here).
- Any new user-facing messaging, retry UI, or "someone else is creating a
  space" indicator — the existing generic paywall response is sufficient.
- Rate-limiting or throttling space-creation requests generally (that's a
  different concern from cap correctness; not implied by this item).

### ❓ Open Questions for Product Owner
1. **Should the client auto-retry a race-lost rejection?** Today's paywall
   response means "you're genuinely at the cap, go upgrade." Under this fix,
   a request that loses the race gets the *identical* response even though,
   from the user's point of view, "the other request already took the last
   slot" is a slightly different story than "you were already at 2 before
   you clicked." Recommendation: treat it identically (open the same paywall)
   — introducing a distinct "try again" state adds complexity for a rare
   edge case with no clear user benefit. Flagging for confirmation since the
   task's own notes raise this as unresolved.
2. **Mechanism choice (serializable transaction vs. DB-level constraint) is
   explicitly left to the tech-lead** per the task notes — this document
   intentionally does not prescribe one, since both satisfy the same
   business guarantee (FR-1) and differ only in retry/latency
   characteristics under contention, which is a technical trade-off.
3. Is there an existing or planned admin/observability need to know *how
   often* this race is actually hit in production (e.g. to size how much
   effort further hardening deserves)? Not required for Phase 1, but worth a
   yes/no so the tech-lead knows whether to leave a signal behind.
