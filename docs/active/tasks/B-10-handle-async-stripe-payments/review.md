# Code Review: B-10 handle-async-stripe-payments

**Date**: 2026-07-14
**Reviewer**: branch-code-reviewer agent
**Diff base**: origin/main (uncommitted working tree on `main`)
**Files changed (B-10 scope)**: 1 product file — `src/Tidansu.Infrastructure/Services/StripeBillingService.cs` — plus task-folder docs

## Summary
A tight, well-scoped infra-only change: two new webhook cases
(`async_payment_succeeded` reusing the renamed shared grant handler,
`async_payment_failed` as a logged no-op), both routed through the existing
`ProcessOnceAsync` ledger. The change matches its tech-tasks and requirements
faithfully, introduces no new grant path, no schema/Kiota surface, and no
regression to the card path. One genuine loose end: the developer's own flagged
third log literal was left un-neutralized, which half-defeats the observability
goal (FR-4) that the log edits exist to serve. No correctness, security, or
plan-limit defects found in scope.

## 🔴 Critical (must fix before merge)
None.

## 🟠 Major (strongly recommended)

### [M1] Third hard-coded event-type log literal left un-neutralized in the now-shared handler
**File**: `src/Tidansu.Infrastructure/Services/StripeBillingService.cs:256`
**Category**: Functional (observability / FR-4)
**Description**: `OnCheckoutSessionPaidAsync` is now shared by
`checkout.session.completed` **and** `checkout.session.async_payment_succeeded`.
T2 neutralized two of its three hard-coded `"checkout.session.completed"` string
literals to `{EventType}` (the no-client-ref warning at L235 and the not-yet-paid
info at L248), but the **unknown-user-reference** warning still reads:
```csharp
_logger.LogWarning("checkout.session.completed for unknown user reference; ignoring");
```
When a delayed-method grant resolves to an unknown/unresolvable user id, this will
log `checkout.session.completed ...` even though the event was
`async_payment_succeeded`. This is the exact mislabeling FR-4 exists to prevent —
the async path is dormant, so a greppable, accurately-labeled log is the *only*
signal that it behaved correctly. The developer flagged this literal themselves; it
sits squarely within T2's stated intent ("replace hard-coded event-type literals so
async grants log accurately") and was simply missed. It is not a merge-blocker
(dormant path, log string only), hence Major not Critical, but it is a one-line fix
that completes the task's own goal.
**Recommendation**:
```csharp
_logger.LogWarning("{EventType} for unknown user reference; ignoring", stripeEvent.Type);
```
(Optionally also carry `session.ClientReferenceId` + `stripeEvent.Id` for parity with
the other warning lines, though the current message deliberately omits the reference.)

## 🟡 Minor (nice-to-have)

### [N1] `TryGetPeriodEndAsync` comment now narrower than reality
**File**: `src/Tidansu.Infrastructure/Services/StripeBillingService.cs:344`
**Category**: Comment accuracy
**Description**: The helper comment reads "checkout.session.completed carries no
period end — fetch the subscription to record it." The grant handler that calls it
now also serves `async_payment_succeeded`, so this helper is invoked for both event
types. The statement remains true for `completed` and the behavior is unaffected,
but for consistency with the newly-shared framing it slightly under-describes the
caller.
**Recommendation**: Broaden to "the checkout-session grant path carries no period
end" or leave as-is (low value).

## 🧭 Convention Violations (project rules)
- None. Layer discipline is clean (Infrastructure only, no business-logic or
  Application/Domain leak). Comment density and style match the surrounding
  heavily-annotated file. New handler comments are accurate: `OnAsyncPaymentFailedAsync`
  correctly describes the silent-no-op / never-throw contract, and the switch-arm
  comments correctly describe the single-grant-path rationale.

## 🏗️ Architecture Notes
- **Scope contamination (not a B-10 defect):** the same uncommitted
  `StripeBillingService.cs` carries a `user.SyncOn = false` hunk in
  `OnSubscriptionDeletedAsync` (L329–331). This belongs to **B-8**
  (security-scalability-audit — confirmed: `SyncOn` referenced in B-8's task/audit
  docs, not in B-10's tech-tasks) and is already covered by B-8's review. It is not
  part of B-10's enumerated scope; flagging only so the two tasks' diffs aren't
  conflated at commit time. Recommend committing B-10's async-payment hunks
  separately from the B-8 sync-downgrade hunk.
- **Guard reuse is correct.** Reusing the `PaymentStatus is not ("paid" or
  "no_payment_required")` guard for `async_payment_succeeded` is sound: that event
  arrives `paid`, so the guard always admits it — no second parameter or forked
  branch needed. The tech-tasks' Stripe-docs finding (OQ-3) backs this, and even the
  docs-impossible `no_payment_required` case would still pass. No double-grant risk:
  for a delayed method, `completed` arrives unpaid (guard blocks), then
  `async_payment_succeeded` grants; distinct event ids mean distinct ledger rows, and
  the grant is idempotent (sets `Plan.Pro`) regardless.
- **Idempotency preserved.** Both new cases sit below the signature-verify block and
  route through `ProcessOnceAsync` (claim-then-mutate in one transaction), keyed on
  event id — `succeeded` and `failed` are distinct rows, neither shadows the other.
  No ordering was disturbed.

## 👍 Positives
- Single Pro-grant code path preserved — the async success case reuses the shared
  handler verbatim rather than forking grant logic, exactly the trust-model
  discipline the requirements demanded.
- `OnAsyncPaymentFailedAsync` is correctly a non-throwing, non-mutating `Task`-returning
  no-op that null-tolerates a non-`Session` payload and logs event id + reference —
  cannot wedge Stripe retries.
- Rename `OnCheckoutCompletedAsync` → `OnCheckoutSessionPaidAsync` is clean with no
  dangling references anywhere in the solution.
- Comments accurately explain *why* (dormant path, log-as-only-signal, silent-failure
  consistency with `invoice.payment_failed`), matching the file's existing style.

## Action Checklist
- [x] [M1] Neutralize the L256 unknown-user warning literal to `{EventType}` so async
      grants log accurately (completes T2's FR-4 goal). **Fixed inline 2026-07-14** —
      now `_logger.LogWarning("{EventType} for unknown user reference; ignoring", stripeEvent.Type)`.
- [x] [N1] Broaden the `TryGetPeriodEndAsync` comment to cover the shared grant path.
      **Fixed inline 2026-07-14** — comment now names both `completed` and
      `async_payment_succeeded`.
- [ ] (Hygiene) Commit B-10's async-payment hunks separately from the unrelated B-8
      `SyncOn` downgrade hunk in the same file. *(Deferred to commit time — not yet committed.)*

## Security review (net-new pass)
A dedicated security-reviewer audited the same diff through the trust/fail-open/secret-leak
lens (scoped to avoid re-deriving the branch findings) and reported **no net-new
Critical/Major findings**. Confirmed intact: no client-trusted grant path (account resolved
solely from server-set `ClientReferenceId`), signature-verify-first preserved (forged async
event mutates nothing), claim-then-mutate idempotency intact for both new events, no
double-grant / grant-without-settlement, and the failure no-op cannot wedge retries or leak
PII (logs only `EventType` + `ClientReferenceId` + event id).

## Resolution
Both branch findings (M1, N1) applied inline by the orchestrator; `dotnet build` green
(0 errors; the 8 `NU1903` advisory warnings are pre-existing and unrelated). B-10 complete.
