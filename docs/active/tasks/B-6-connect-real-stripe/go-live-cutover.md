# B-6 · Stripe go-live cutover procedure (FR-13)

**Status: documentation only. No live charge is made as part of B-6.** B-6 is
complete when the integration is verified end-to-end in **Stripe test mode**.
Flipping to **live** is a separate, deliberate act by the owner, and is **gated** on
the legal prerequisites below.

> ⛔ **Go-live gate.** Do **not** set live Stripe keys or `Enabled=true` in production
> until **all** of the §10 A–F checklist **and** the §11 open questions in
> [`docs/legal/poland-payments-compliance.md`](../../../legal/poland-payments-compliance.md)
> are satisfied and professionally confirmed (accountant/lawyer). Going live before
> that means charging real customers without the required VAT/OSS registration,
> invoicing/KSeF plan, consumer-law checkout, and legal pages in place.

## What "cutover" means here

Going live requires **only configuration** — no code change. The same build that runs
in test mode runs in production; it selects behaviour from `StripeSettings` +
environment. The DI wiring is:

| Environment / config | Billing service | Behaviour |
|---|---|---|
| `Enabled && IsConfigured` | `StripeBillingService` | Real Stripe (test OR live, per the keys supplied) |
| `Enabled && !IsConfigured` | — | **Fails loud at startup** (names the missing `StripeSettings__*` key) |
| `!Enabled`, Development | `DirectBillingService` | Dev convenience — flips plan with no payment |
| `!Enabled`, Production | `DisabledBillingService` | Upgrade → clear "billing unavailable" (503); **never** free Pro |

`IsConfigured = Enabled && SecretKey && ProPriceId`. Test vs live is decided purely by
whether the supplied `SecretKey`/`WebhookSecret`/`ProPriceId` are `sk_test_…` or
`sk_live_…` values — the code does not care which; **you** control it via secrets.

## Configuration keys

Bound from the `StripeSettings` config section; in production supply them as
environment variables / secrets (double-underscore form), **never** committed to
source:

| Key | Env var | Notes |
|---|---|---|
| `Enabled` | `StripeSettings__Enabled` | `true` to activate real Stripe |
| `SecretKey` | `StripeSettings__SecretKey` | `sk_live_…` for prod; secret |
| `WebhookSecret` | `StripeSettings__WebhookSecret` | `whsec_…` from the **live** webhook endpoint; secret |
| `ProPriceId` | `StripeSettings__ProPriceId` | `price_…` of the **live** Pro price |
| `SuccessUrl` | `StripeSettings__SuccessUrl` | prod URL, e.g. `https://<host>/account?upgraded=1` |
| `CancelUrl` | `StripeSettings__CancelUrl` | prod URL, e.g. `https://<host>/pricing` |
| `TaxEnabled` | `StripeSettings__TaxEnabled` | FR-10 — off until VAT posture confirmed (§4/§5, §11 OQ-2) |
| `ConsentRequired` | `StripeSettings__ConsentRequired` | FR-11 — on once consumer-law copy is finalized (§6) |
| `TermsOfServiceUrl` / `PrivacyUrl` / `WithdrawalUrl` | `StripeSettings__…` | FR-11 — live legal-page URLs |
| `InvoicingEnabled` | `StripeSettings__InvoicingEnabled` | FR-12 — on once the Stripe invoice template is configured (§7.2) |

Frontend: the in-app consent step is gated by `VITE_CHECKOUT_CONSENT=true` (build-time
env in `src/Tidansu.App`), which must be enabled for the FR-11 checkout step to appear.

## Cutover steps (once the §10/§11 gate is cleared)

1. **In the Stripe Dashboard (live mode):**
   - [ ] Create the live **Pro price** → note its `price_…` id.
   - [ ] Register a **live webhook endpoint** → `https://<prod-host>/api/billing/webhook`,
         subscribed to at least: `checkout.session.completed`,
         `customer.subscription.updated`, `customer.subscription.deleted`. Copy its
         **signing secret** (`whsec_…`).
   - [ ] Configure **Stripe Tax** (registrations per §4/§5) and the **invoice template**
         (numbering, seller NIP, VAT breakdown, PLN presentation per §7.2) — only when
         the accountant has confirmed the details.
   - [ ] Set the **terms-of-service URL** used by hosted Checkout consent (if
         `ConsentRequired`).
2. **In production configuration / secrets:**
   - [ ] Set `StripeSettings__SecretKey` = `sk_live_…`, `__WebhookSecret` = `whsec_…`
         (from step 1), `__ProPriceId` = the live price, `__SuccessUrl` / `__CancelUrl`
         = prod URLs, and `StripeSettings__Enabled = true`.
   - [ ] Flip the legal-hook flags once their copy/config is finalized:
         `__TaxEnabled`, `__ConsentRequired` (+ the `*Url`s), `__InvoicingEnabled`.
   - [ ] Set `VITE_CHECKOUT_CONSENT=true` for the frontend build (with `ConsentRequired`).
3. **Confirm legal pages are live and reachable before purchase** (§6.3, §10.E):
   ToS/Regulamin, privacy, withdrawal/refund, seller imprint (JDG owner, NIP, address,
   contact).
4. **Confirm GDPR posture** (§8): Stripe DPA accepted, RoPA updated, transfer/SCC
   stance confirmed.
5. **Restart the app.** On boot, `Enabled && IsConfigured` selects
   `StripeBillingService`; a misconfiguration fails loud (names the missing key) rather
   than silently running degraded.
6. **Smoke-test carefully** (a real card = a real charge): a single real subscription,
   then confirm the webhook granted Pro, the invoice is compliant, and cancellation
   returns to Free at period end. Refund/close the test purchase.

## Rollback

Set `StripeSettings__Enabled = false` (or remove the live keys) and restart. In
Production this selects `DisabledBillingService` — upgrades return a clean "billing
unavailable" and **no** account is charged or wrongly upgraded. Existing Pro accounts
keep their plan; their subscriptions continue in Stripe until separately cancelled.

## Gate reference

- **§10 A–F** (registration & tax, Stripe config, invoicing/KSeF, consumer-law
  checkout, legal pages, GDPR) — the go-live prerequisites checklist.
- **§11** — the open questions for the accountant/lawyer (PL VAT posture, KSeF date,
  consent wording, invoice presentation, DPA/transfers).

Both live in [`docs/legal/poland-payments-compliance.md`](../../../legal/poland-payments-compliance.md).
