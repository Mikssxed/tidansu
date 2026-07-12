---
id: B-6
slug: connect-real-stripe
title: Connect real Stripe (test-mode in dev, live in prod)
status: in-review      # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: [B-5]      # B-5 (Poland legal research) has landed; it gates GOING LIVE, not the build
touch-points:
  - src/Tidansu.Infrastructure/Services/StripeBillingService.cs
  - src/Tidansu.Application (billing command/handlers)
  - src/Tidansu.API (BillingController, webhook endpoint, Program.cs config)
  - appsettings*.json / environment secrets
  - possibly Kiota regen if the billing contract changes
---

# B-6 · Connect real Stripe (test-mode in dev, live in prod)

## Description
The Stripe billing seam already exists (`StripeBillingService` + Checkout +
`/api/billing/webhook`) but is off by default and has never been exercised against
a real Stripe account. Connect a real Stripe account so upgrades genuinely charge:
Checkout works, the webhook applies Pro on payment with signature verification, and
downgrades/cancellations are handled. Local/dev uses Stripe **test mode**;
production uses **live** keys. All keys/secrets come from environment (never in
source). Success = a real (test-mode) purchase flips the account to Pro via the
webhook end-to-end.

## Acceptance criteria
- [ ] A real (Stripe **test-mode**) Checkout purchase flips the buyer's account to
      Pro end-to-end via the webhook (not a manual DB edit).
- [ ] The webhook **verifies the Stripe signature** and rejects unsigned/forged
      payloads; only genuine Stripe events mutate plan state.
- [ ] **Downgrade / cancellation** (subscription canceled or payment lapsed) returns
      the account to Free, keeping data but making over-cap content read-only.
- [ ] Dev uses **test-mode** keys, prod uses **live** keys; the app selects the
      right mode by environment with **no secrets in source**.
- [ ] Fails safely if Stripe is misconfigured (no keys → billing disabled / clear
      error, not a crash or a silent free upgrade).
- [ ] No regression to the existing paywall/plan-cap flow for users who never touch
      billing.

## Notes
- **Gate vs. build.** B-5 (legal research, ✅ done) produced a §10 "go-live
  prerequisites" checklist in `docs/legal/poland-payments-compliance.md`. That
  checklist gates **charging a real customer / flipping Stripe to LIVE** — it is
  **not** an implementation blocker for building/testing B-6 in test mode. Keep the
  two separate: B-6 can be built and verified in Stripe test mode now; the live
  cutover waits on the owner satisfying §10 A–F and confirming the §11 open
  questions with an accountant/lawyer.
- **Legal items that touch the code path** (so the PM/tech-lead should scope how the
  seam *supports* them, even if live copy is finalized later):
  - **Stripe Tax** enabled in Checkout (destination VAT calculated & collected).
  - **Withdrawal-consent + acknowledgement waiver** step + mandatory pre-purchase
    disclosures and a **"Subscribe & pay"** obligation-to-pay button before Pro
    activates (§6).
  - **Stripe Invoicing** emitting compliant invoices (NIP, customer tax ID capture,
    VAT breakdown).
  - Legal pages (ToS/Regulamin, privacy, withdrawal/refund, imprint) reachable
    before purchase.
  Decide with the owner at the gates which of these land inside B-6 vs. a follow-up.
- ⚠️ Billing is a **sensitive surface** (payments + plan gating + webhook trust).
  The pipeline pauses for the user at implementation steps touching billing/plan
  limits, and Stage 4 runs the **security-reviewer** in addition to the branch
  reviewer.
- **Sensitive area of concern:** webhook signature verification, idempotency
  (Stripe retries events), mapping a Stripe customer/subscription back to a Tidansu
  user securely, and never granting Pro from an unverified request.
- **Known limitation — delayed/async payment methods (follow-up).** `OnCheckoutCompletedAsync`
  now only grants Pro when `session.PaymentStatus` is `"paid"` (normal card path) or
  `"no_payment_required"` (100%-off/trial). Delayed-notification methods (e.g. SEPA, some
  wallets) can emit `checkout.session.completed` with status still `"unpaid"` before funds
  settle, so they will NOT be promoted by that event. When such methods are enabled, handle
  the follow-up `checkout.session.async_payment_succeeded` event to grant Pro once payment
  confirms (and `checkout.session.async_payment_failed` to leave the account on Free). Not in
  scope for B-6 (card-only test mode does not surface it).

### Tech-planning notes (2026-07-12, tech-lead)
Tech tasks → [`./tech-tasks.md`](./tech-tasks.md). Key decisions for the developer:
- **Free-Pro leak is the #1 finding.** Today the fallback when Stripe is unconfigured
  is `DirectBillingService`, which flips to Pro with **no payment** — in Production
  that is free Pro for everyone. Plan introduces a `DisabledBillingService` for the
  prod-off case and a fail-loud startup guard for `Enabled && !IsConfigured` (mirrors
  the JWT/SMTP guards). This is the load-bearing FR-2 change.
- **Schema:** two `User` fields groups (`StripeCustomerId`/`StripeSubscriptionId`/
  `CurrentPeriodEnd`/`CancelAtPeriodEnd`) + a new `ProcessedStripeEvent` idempotency
  table → **one migration** (`StripeBillingFields`). Downgrade→read-only needs **no
  new code** — `PlanPolicy.CheckSpaceMutation` already enforces it; the webhook just
  has to flip `Plan` back to Free.
- **Contract change → Kiota regen:** `ChangePlanResult` gains
  `CancellationScheduled` + `ProAccessUntil` for the owner-decided **end-of-period**
  cancel. Regen tooling caveat noted in the plan (version-matched swagger CLI +
  running-app fallback).
- **Owner decisions honored:** all three legal hooks (Tax/FR-10, consent+"Subscribe &
  pay"/FR-11, Invoicing/FR-12) built behind config flags, off by default, test-verifiable
  now; cancel = `cancel_at_period_end`; lapse downgrade only on
  `customer.subscription.deleted` after dunning, never on first `invoice.payment_failed`.
- **Open questions** carried into tech-tasks: idempotency table vs column, success/cancel
  UX targets, launch VAT flag value, in-app vs Stripe-hosted consent split. None block
  the build; live cutover stays gated on legal §10/§11 (documented, no live charge).

## Stage-4 review complete (2026-07-12)
Branch review → [`./review.md`](./review.md); security audit → [`./security-review.md`](./security-review.md).
**No Critical.** Both reviewers verified the webhook-trust invariants by tracing. 3 Major
+ cheap Minor, all **fixed** (owner chose fix-now) and re-verified green:
- **M1/S-H1** — `WebhookSecret` now required by `IsConfigured` + fail-loud guard.
- **M2/S-M2** — idempotency claim + plan mutation now commit in ONE EF transaction
  (`ProcessOnceAsync`); a mutation failure rolls the claim back so Stripe's retry re-applies.
- **S-M1** — Pro granted only when `session.PaymentStatus` ∈ {paid, no_payment_required}.
- **M3** — consent step no longer discloses a price that differs from the single charged
  `ProPriceId` (placeholder, single price; `TODO(go-live)` to source the real amount).
- Template-purity nit in `PricingView.vue` fixed (equality moved to `computed`).

**Accepted / backlog (not fixed now):**
- Minor trade-off: `ProcessOnceAsync` holds the DB transaction across the best-effort
  Stripe `GetAsync` in `OnCheckoutCompletedAsync` (period-end fetch). Low webhook volume →
  acceptable; move the fetch outside the transaction if lock-hold ever matters.
- Low: no rate-limit/body-size cap on the anonymous webhook endpoint.
- Low (out of B-6 scope): pre-existing NU1903 dependency advisories (AutoMapper 12.0.1,
  System.Security.Cryptography.Xml 9.0.0, Microsoft.OpenApi 2.4.1) — dependency-bump ticket.

## Implementation complete (2026-07-12) → in-review
All code tasks in [`./tech-tasks.md`](./tech-tasks.md) are done; both static gates
green (`dotnet build`, `npm run build`). Highlights:
- **Free-Pro-in-prod hole closed** — prod-off now resolves `DisabledBillingService`;
  `Enabled && !IsConfigured` fails loud at startup naming the missing key.
- **Webhook** reworked to signature-first → idempotency-claim → secure mapping
  (`ClientReferenceId`/stored Stripe ids) → mutate; per-event private handlers;
  `invoice.payment_failed` is a deliberate no-op (downgrade only on
  `customer.subscription.deleted` after dunning).
- **End-of-period cancel** via `cancel_at_period_end`, `ScheduledCancellation` result
  → frontend shows "Pro until <date>".
- **Legal hooks** (Tax / in-app consent + `ConsentCollection` / invoicing via
  `TaxIdCollection`) all behind off-by-default flags; frontend consent step behind
  `VITE_CHECKOUT_CONSENT`.
- **Migration** `StripeBillingFields` scaffolded (additive, zero data-loss) — **not yet
  applied** (applies on next app run with a DB).
- Kiota regenerated (`cancellationScheduled`/`proAccessUntil`).
- **3 Stripe.net-52 deviations from the literal plan** (owner-approved): period end read
  from `SubscriptionItem.CurrentPeriodEnd` (moved off `Subscription`); dropped
  `CustomerUpdate` (Stripe rejects it without a passed customer); invoicing hook =
  `TaxIdCollection` + Dashboard template (subscription-mode invoices are automatic;
  `InvoiceCreation` is payment-mode only).

**Still pending — owner action:** the 5 interactive Stripe **test-mode** drives (happy
path, webhook trust/idempotency, cancel end-of-period, safe-fail, legal hooks) need a
Stripe account + `sk_test_` keys + Stripe CLI + LocalDB — see [`./SETUP.md`](./SETUP.md).
**Going live** is a further gate — see [`./go-live-cutover.md`](./go-live-cutover.md)
(§10/§11 of the legal doc).

## Owner decisions (Stage-2 gate, 2026-07-12)
- **Success UX:** after a successful purchase, land on a **"Welcome to Pro"
  confirmation** screen (keep `SuccessUrl` → `/account?upgraded=1` style). Cancel/
  abandon returns to pricing.
- **Idempotency (OQ1): accepted** — dedicated `ProcessedStripeEvent` table with
  atomic unique-PK dedupe.
- **Consent (OQ4): accepted** — in-app pre-Checkout "Subscribe & pay" + withdrawal-
  waiver acknowledgement step, with Stripe `ConsentCollection`/terms URL as
  complement; final legal copy is a downstream lawyer task.
- **Stripe Tax (OQ3): accepted** — built behind `TaxEnabled`, **off by default**,
  test-verifiable; whether it's ON at go-live is an accountant decision, not a
  B-6 blocker.

## Owner decisions (Stage-1 gate, 2026-07-12)
- **Legal-checkout scope: build ALL three inside B-6** — FR-11 (withdrawal-consent
  waiver + pre-purchase disclosures + "Subscribe & pay" button), FR-10 (Stripe Tax),
  FR-12 (Stripe Invoicing) — all built behind config and verified in **test mode**;
  live copy/enablement still finalized at go-live. (Not deferred.)
- **Cancel timing: end of paid period** — user keeps Pro until the period they paid
  for ends (Stripe `cancel_at_period_end`), then downgrades to Free.
- **Payment-lapse grace: after a grace/retry window** — follow Stripe dunning;
  downgrade to Free only once retries are exhausted, not on the first failure.
- KSeF remains a separate follow-up (not in B-6). Legal-page *copy* + consumer-law
  *wording* remain downstream lawyer tasks; B-6 builds the hooks/steps, not final text.
- Still open (working assumptions ok, revisit at tech-planning if needed): success/
  cancel return UX (OQ-6), launch VAT posture (OQ-2/OQ-5), live-cutover authority
  (confirmed: owner authorizes live once §10 A–F + §11 met — B-6 done = test-verified).

## Open questions (from requirements — confirm with owner before/at tech-planning)
Full detail in [`./requirements.md`](./requirements.md); the load-bearing ones:
1. **Legal-checkout scope inside B-6.** Build the consumer-law checkout step
   (withdrawal-consent waiver + disclosures + "Subscribe & pay"), Stripe Tax, and
   Stripe Invoicing *now behind config/test-verified*, or defer each to a follow-up?
2. **Downgrade timing:** user cancel ends Pro immediately or at end of paid period?
3. **Payment-lapse grace:** downgrade on first failed renewal or after a retry window?
4. **Done bar / live authority:** B-6 = test-mode verified; owner authorizes live once
   §10 A–F + §11 professionally confirmed (§11 OQ-1). Agreed?
5. **Launch VAT posture (§11 OQ-2):** VAT-OSS from day one (Stripe Tax on at go-live)
   or rely on the €10k grace short-term?
6. **Success/cancel return UX:** back to the gated action, or a "Welcome to Pro" screen?
7. **KSeF & currency (§11 OQ-5/OQ-7):** KSeF handled as a separate task; decide
   single vs. localized pricing before go-live (interacts with VAT/invoicing).

_Build vs. gate reminder: FR-1–FR-9 + FR-14 are Phase 1–3 (buildable & test-verifiable
now). FR-10–FR-12 are legal-checkout support hooks (Phase 4). FR-13 is documented
live-cutover readiness (Phase 5), gated on §10/§11 — no real charge in B-6._

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
