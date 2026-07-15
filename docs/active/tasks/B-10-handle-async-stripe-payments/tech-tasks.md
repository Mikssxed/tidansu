# B-10 · Handle delayed/async Stripe payment methods — Technical Tasks

Infra-only change to `StripeBillingService` (the single Pro-grant authority). Two
new webhook event types join the `HandleWebhookAsync` switch, both routed through
the existing `ProcessOnceAsync` idempotency ledger. No new endpoint, no DTO/contract
change, **no Kiota regen, no EF migration, no new dependency** — confirmed below.

**Traceability:** FR-1 → T2/T3 · FR-2 → T2/T4 · FR-3 → T3 (guard/handler untouched) ·
FR-4 → T2/T4 (log neutralization) · non-regression verified in T5/T6.

## Seam summary (codebase-design terms)

The webhook dispatch is a shallow router (`switch` on `stripeEvent.Type`) in front of
one deep seam: `ProcessOnceAsync` (the claim-then-mutate transaction) wrapping a
per-event handler `Func<Event, CancellationToken, Task>`. B-10 adds **no new seam** —
it adds two more `case` arms that reuse the existing handler shape. The grant logic for
`async_payment_succeeded` must be the *same* handler as the card path so there is
exactly **one** Pro-grant code path (locality of the trust model), never a second,
divergent one. The failure event gets a new no-op handler that still commits a ledger
row for a consistent audit trail.

**Stripe-docs finding (resolves OQ-3):** On `checkout.session.async_payment_succeeded`
the session's `PaymentStatus` transitions to `"paid"`. `no_payment_required` is a
`completed`-only status (trials / 100%-off coupons settle synchronously). Stripe's own
fulfillment guidance gates on `payment_status != "unpaid"`, which is spirit-equivalent
to our existing `is not ("paid" or "no_payment_required")` guard. Therefore the shared
handler's guard is **harmless and correct as-is** for the async event: it always passes
on `"paid"`, and even in the (docs say impossible) case that `no_payment_required`
appeared, the guard would still admit it. **The plan does not break under either
assumption** — the guard needs no change and no new parameter.

---

## 📋 Technical Tasks

### Backend — Infrastructure

- [x] **T1 — [verify]** Confirm the async events arrive settled and route correctly:
      re-read `src/Tidansu.Infrastructure/Services/StripeBillingService.cs`
      `HandleWebhookAsync` (~L156 switch), `ProcessOnceAsync` (~L190) and
      `OnCheckoutCompletedAsync` (~L213). Confirm (a) the `default` arm acks unhandled
      events with 200 (no throw) so today both new types silently ack, and (b)
      `IProcessedStripeEventStore.TryMarkProcessedAsync(eventId, eventType, …)` keys the
      ledger on event **id** (so a `succeeded` and a `failed` event are distinct rows).
      *(No code — a read to lock the two insertion points before editing.)*

- [x] **T2 — modify** the shared grant handler in
      `src/Tidansu.Infrastructure/Services/StripeBillingService.cs`: rename
      `OnCheckoutCompletedAsync` → `OnCheckoutSessionPaidAsync` (it now serves both
      `checkout.session.completed` and `checkout.session.async_payment_succeeded`) and
      replace the two hard-coded `"checkout.session.completed"` string literals in its
      log messages (the no-client-ref warning and the not-yet-paid info) with
      `stripeEvent.Type`, so a grant that arrives via the async event logs the *accurate*
      event type. *Why:* this path is dormant until delayed methods are enabled, so logs
      are the only signal (FR-4) — a hard-coded literal would mislabel every async grant.
      Keep the `PaymentStatus is not ("paid" or "no_payment_required")` guard **exactly
      as-is** (see Stripe-docs finding: harmless, always passes on `"paid"`). Keep the
      grant body (`ClientReferenceId` resolution → `Plan.Pro`) unchanged.

- [x] **T3 — modify** `HandleWebhookAsync`'s switch in the same file: add
      `case "checkout.session.async_payment_succeeded":` routing to
      `await ProcessOnceAsync(stripeEvent, OnCheckoutSessionPaidAsync, cancellationToken)`
      (reuse the renamed handler — same ledger, same claim-then-mutate transaction, same
      `ClientReferenceId`-only identity resolution as the card path). Place it directly
      under the existing `checkout.session.completed` case. Do **not** reorder the
      signature-verify-first block or `ProcessOnceAsync`'s claim-before-mutate ordering.
      🔒 blocked by: T2

- [x] **T4 — add** a new no-op failure handler
      `OnAsyncPaymentFailedAsync(Event stripeEvent, CancellationToken)` in the same file
      and wire `case "checkout.session.async_payment_failed":` to
      `await ProcessOnceAsync(stripeEvent, OnAsyncPaymentFailedAsync, cancellationToken)`.
      The handler must: cast `stripeEvent.Data.Object` to `Session`, log at **info** the
      `ClientReferenceId` + `stripeEvent.Id` (account stays Free — nothing to revoke,
      Pro was never granted for this session), and return **without mutating** any user
      state. Never throw / never return non-2xx (Stripe would retry a permanently-failing
      event). Routing through `ProcessOnceAsync` is the locked decision (OQ-2): the ledger
      row gives a consistent audit trail; the one extra row is accepted and there is
      nothing to roll back. Do **not** send any user notification (locked decision:
      silent, consistent with the `invoice.payment_failed` no-op).
      🔒 blocked by: T1

### Backend — API / Frontend

- [x] No API, DTO, route, or controller-signature change → **no Kiota regeneration.**
- [x] No entity/`TidansuDbContext` model change (the ledger already stores arbitrary
      event ids/types) → **no EF migration.**
- [x] No frontend change (grant is server-side; the existing session refresh surfaces
      the new Pro state).

### Refactoring

- [x] **[refactor]** T2's log-literal neutralization *is* the touched-file cleanup
      (removes a now-inaccurate hard-coded event-type string once the handler is shared).
      No other Clean-Architecture / SOLID / DRY / template-purity issues in
      `StripeBillingService.cs` are in scope for B-10 — the file is layer-clean
      (Infrastructure, no business logic leak) and the grant path is already DRY once
      the async case reuses `OnCheckoutSessionPaidAsync`.

### Verification

- [x] **T5 — [verify]** `dotnet build` (solution) green — no signature/API regen needed,
      so a clean backend build is the full compile gate. (No `npm run build` / vue-tsc —
      zero frontend surface touched.)
- [x] **T6 — [verify]** Manual webhook drive against the running API (`dotnet run` in
      `src/Tidansu.API`) using the Stripe CLI, since delayed methods are not enabled so
      the events cannot be produced by a real checkout:
      1. `stripe listen --forward-to localhost:5081/api/billing/webhook` (uses a CLI
         signing secret — set it as the `WebhookSecret` for the run so signature-verify
         passes).
      2. **Grant path (FR-1):** trigger `checkout.session.async_payment_succeeded` with a
         `client_reference_id` set to a real Free user's id and `payment_status = paid`
         (e.g. `stripe trigger checkout.session.async_payment_succeeded
         --add checkout_session:client_reference_id=<userId>`). Observe: the user flips to
         `Plan.Pro`, an "upgraded user … to Pro" info log fires, and the log line names
         `checkout.session.async_payment_succeeded` (not `.completed`).
      3. **Idempotency (FR-1):** re-send the same event id → observe the
         "Skipping already-processed" log and **no** second mutation.
      4. **Failure no-op (FR-2/FR-4):** trigger `checkout.session.async_payment_failed`
         with the same `client_reference_id` → observe an **info** log carrying the
         reference + event id, the user's plan **unchanged**, a ledger row written, and
         a 200 ack. Re-send → "Skipping already-processed", still a no-op.
      5. **Non-regression (FR-3):** trigger `checkout.session.completed` (paid) → still
         grants Pro exactly as before; unknown `client_reference_id` on either event →
         warning logged, no mutation, still 200.

---

## 🔒 Security Considerations

- **Single grant path / no divergent trust model** — 🟠 High. The real risk in this
  change is *introducing a second Pro-grant code path* that trusts client-supplied
  identity (e.g. resolving the account by email) instead of the authenticated
  `ClientReferenceId`. Mitigation: **reuse `OnCheckoutSessionPaidAsync` verbatim** for
  `async_payment_succeeded` (T3) — do not fork the grant logic.
  - [x] `async_payment_succeeded` resolves the account **solely** via
        `session.ClientReferenceId` (inherited by reusing the shared handler); no
        email-based or client-supplied lookup is added.
- **Signature-verify-first preserved** — 🟡 Medium. Both new cases sit *inside* the
  switch that runs only after `EventUtility.ConstructEvent` succeeds, and both go through
  `ProcessOnceAsync` (claim-then-mutate in one transaction). A forged/duplicate delivery
  still mutates nothing.
  - [x] New cases are added below the signature-verification block and both call
        `ProcessOnceAsync`; ordering in `HandleWebhookAsync` / `ProcessOnceAsync` is
        untouched.
- **Failure handler cannot wedge the webhook** — 🟢 Low. A throw or non-2xx on
  `async_payment_failed` would make Stripe retry a permanently-failing event forever.
  - [x] `OnAsyncPaymentFailedAsync` never throws and performs no mutation; the caller
        acks 200.
- **No payload logging** — 🟢 Low. Match existing handlers: log only event id + account
  reference, never the raw webhook body.
  - [x] Neither new/edited log statement logs `payload` or PII beyond the user reference.

## 📈 Scalability / Correctness Considerations

- **One extra ledger row per failed async payment** — negligible; accepted per the locked
  OQ-2 decision. `ProcessedStripeEvent` is keyed by event id, so `succeeded` and `failed`
  events for the same session are distinct rows and neither shadows the other.
  - [x] Confirmed in T1 that the ledger keys on event **id** (not session id).
- **No new query surface** — the grant handler's only extra I/O is the existing
  best-effort `TryGetPeriodEndAsync` Stripe call, unchanged and already wrapped so a
  display-date fetch can never fail the plan-granting transaction. No EF N+1 /
  `AsNoTracking` / unbounded-query concerns introduced.
  - [x] No new DbContext/EF usage added in Infrastructure beyond the existing handler.
- **Plan-limit gate:** N/A as a *creation* gate — this **is** the billing-grant path
  itself, not a capability that consumes a plan limit. No `PlanLimitException` /
  paywall-reason task applies (no new `spaces|zones|items|photos|sync` mutation).

## 📦 New Dependencies

No new dependencies required.

## ❓ Open Questions

1. **OQ-3 (`no_payment_required` on async) — RESOLVED during planning.** Stripe docs
   confirm `async_payment_succeeded` arrives with `payment_status = "paid"`;
   `no_payment_required` is `completed`-only. The shared guard is harmless under either
   assumption, so no code branch is needed and the plan does not break if this ever
   changes. (Sources below.)
2. **OQ-1 (notify on failure) — LOCKED: no.** `async_payment_failed` stays silent
   (T4), consistent with the `invoice.payment_failed` no-op. No task.
3. **OQ-2 (ledger routing for failure) — LOCKED: route through `ProcessOnceAsync`.**
   Implemented in T4; one extra ledger row accepted.
4. **Verification realism (non-blocking):** these events are dormant until delayed
   methods are enabled in Stripe, so T6 relies on Stripe-CLI-injected fixtures with a
   crafted `client_reference_id`. If the CLI `stripe trigger` fixture cannot set a real
   user id, fall back to hand-posting a CLI-signed event body. Not a design blocker.

**Sources (OQ-3):**
- https://docs.stripe.com/checkout/fulfillment — recommended fulfillment gates on
  `payment_status != "unpaid"`; same handler serves `completed` + `async_payment_succeeded`.
- https://docs.stripe.com/payments/payment-intents/verifying-status — session status is
  `processing` until it succeeds (`paid`) or fails.
</content>
