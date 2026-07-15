---
id: B-10
slug: handle-async-stripe-payments
title: Handle delayed/async Stripe payment methods
status: done   # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: [B-6]      # builds on the real-Stripe webhook seam
touch-points:
  - src/Tidansu.Infrastructure/Services/StripeBillingService.cs
---

# B-10 · Handle delayed/async Stripe payment methods

## Description
Follow-up from B-6. Today Pro is granted only when `checkout.session.completed`
reports `PaymentStatus == "paid"` (or `no_payment_required`), which is correct for
card payments. Delayed-notification payment methods (e.g. SEPA debit, some wallets)
can complete checkout with payment still *pending* and only settle later — so a buyer
using one of those would pay and never receive Pro. If/when such methods are enabled,
the account must be upgraded when the payment actually settles, and left on Free if it
ultimately fails. Not needed while the account is card-only, but cheap insurance for
enabling those methods later.

## Acceptance criteria
- [x] `checkout.session.async_payment_succeeded` grants Pro to the account resolved
      from the session's `ClientReferenceId` (same authoritative-id path as the
      completed handler) — buyer who paid via a delayed method gets Pro on settlement.
- [x] `checkout.session.async_payment_failed` leaves the account on Free (no mutation
      beyond logging) — a failed delayed payment does not grant Pro.
- [x] Both new events flow through the existing idempotency ledger (`ProcessOnceAsync`)
      so Stripe's at-least-once retries stay no-ops.
- [x] Signature-verify-first ordering and the claim-then-mutate transaction are
      unchanged; no regression to the card path (`checkout.session.completed`).

## Notes
### Tech-planning outcome (2026-07-14)
- **Infra-only confirmed:** no Kiota regen, no EF migration, no new endpoint/contract,
  no new dependency, no frontend change. Whole change lives in `StripeBillingService.cs`.
- **Shared grant handler reused as-is (with a rename + log fix), NOT parameterized.**
  `OnCheckoutCompletedAsync` → renamed `OnCheckoutSessionPaidAsync`; `async_payment_succeeded`
  routes to the same handler via `ProcessOnceAsync`. The `PaymentStatus is not ("paid" or
  "no_payment_required")` guard is kept unchanged — it is harmless for the async event
  (which arrives `"paid"`) and needs no extra parameter. The only substantive edit inside
  the handler is replacing hard-coded `"checkout.session.completed"` log literals with
  `stripeEvent.Type` so async grants log accurately (this path is dormant; logs are the
  only signal).
- **OQ-3 resolved:** Stripe docs confirm `async_payment_succeeded` → `payment_status =
  "paid"`; `no_payment_required` is `completed`-only. Guard is correct either way — plan
  does not break if the assumption is ever wrong.
- **OQ-1/OQ-2 locked per product:** failure event is silent (no notification) and still
  routes through `ProcessOnceAsync` (accept one extra ledger row for audit trail).
- Top security note (🟠 High): the risk is creating a *second* grant path that trusts a
  client email. Mitigation is reuse of the single `ClientReferenceId`-based handler — do
  not fork grant logic.

- The prior `OnCheckoutCompletedAsync` (StripeBillingService.cs ~L213) already carries
  a comment naming this exact follow-up. The success handler is the same Session-based
  grant logic; consider reusing it (the completed handler's `PaymentStatus` guard is
  harmless for the async-succeeded event, which arrives already-paid).
- `async_payment_failed` is essentially a logged no-op (account stays Free) — but it
  should still go through `ProcessOnceAsync` for a consistent ledger/ack story, or be a
  deliberate ack-only default; tech-lead to decide. Product recommendation (see
  requirements.md OQ-2): route it through `ProcessOnceAsync` anyway for a consistent
  audit trail, at the cost of one extra ledger row.
- Card-only today: this is defence for when SEPA/delayed methods are enabled. No
  contract/Kiota change, no schema migration expected — infra-only edit.
- Requirements pass flagged two more open questions for the product owner: whether
  `async_payment_failed` should ever notify the user (recommendation: no, stay silent,
  consistent with `invoice.payment_failed`), and whether `no_payment_required` can ever
  appear on `async_payment_succeeded` (assumption: no, that status is completed-only —
  confirm against Stripe's docs during tech planning).

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
