---
name: arch-plan-cap-check-then-insert-race
description: Plan-limit caps use a non-atomic count-then-insert; fix pattern = per-user sp_getapplock re-count-in-lock, not a DB constraint
metadata:
  type: project
---

The plan-limit enforcement in the create/mutate handlers (`PlanPolicy` +
`CountByUserAsync` then insert) is a **non-atomic check-then-insert**: concurrent
same-user requests all pass the gate and all insert, exceeding the cap without
paying. B-8 audit finding S-1 (space cap); B-12 fixes spaces; siblings B-13..B-19
likely carry the same bug for zones/items.

**Why:** narrow but real plan-boundary bypass (revenue leak) triggerable by a
scripted / double-submit client. Product owner wants observability (a distinct
log signal) on race-lost rejections to size how often it fires.

**How to apply (the B-12 shape — reuse for the sibling cap races):**
- Mechanism = **per-user `sp_getapplock`** (exclusive, `@LockOwner='Transaction'`,
  bounded `@LockTimeout`) inside one explicit EF transaction, wrapping an
  **authoritative in-lock re-count + insert**. Single per-user resource → cannot
  deadlock; serializes only same-user creates; uncontended-cheap.
- Keep `PlanPolicy`/`PlanCaps` (the business rule) in the Application handler —
  do NOT push plan logic into Infrastructure. The seam: handler passes the finite
  cap `int` to a repo method (`AddWithinSpaceCapAsync(entity, cap)`) that returns
  `bool` (inserted / rejected-at-cap).
- Handler keeps the cheap pre-check unchanged (no lock) for the ordinary at-cap
  and single-request paths; the lock is taken only when the pre-check passes AND
  the plan cap is finite. **Unlimited (Pro) plans skip the lock entirely** — no
  serialization, no new failure mode.
- FR-4 observability: `LogWarning` only on the in-lock reject branch (race-lost);
  ordinary at-cap stays on the pre-check branch so the two are distinguishable.
- **Rejected alternatives:** DB-level per-user row-count constraint — impossible
  cleanly because caps are plan-variable (Free 2 / Pro unlimited); would encode
  plan into schema. `SERIALIZABLE` + retry loop — heavier, range-lock deadlocks.
- **No EF migration** (runtime lock, not schema) and **no Kiota regen** (403
  `{plan:[reason]}` contract unchanged) — this class of fix is backend-internal.
- Caveat: `sp_getapplock` is SQL-Server-only; context has no `EnableRetryOnFailure`
  so a manual transaction is safe, but if retries are ever enabled the manual tx
  must move inside `CreateExecutionStrategy().ExecuteAsync(...)`.

Related: [[arch_errorhandling-middleware-masks-4xx]] (the `PlanLimitException`
403 arm this reuses lives in `ErrorHandlingMiddleware`).
</content>
