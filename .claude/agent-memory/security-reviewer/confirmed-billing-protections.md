---
name: confirmed-billing-protections
description: Verified Stripe billing/webhook-trust controls (B-6) — don't re-flag these on future billing reviews
metadata:
  type: project
---

Verified on the B-6 billing seam (2026-07-12). Don't re-flag unless the code changes:

- **Webhook signature-first.** `StripeBillingService.HandleWebhookAsync` calls `EventUtility.ConstructEvent` as its first statement; failure → `ValidationException` → 400 before any mutation. `BillingController` reads raw `Request.Body` (no model binding); `Program.cs` has no body-buffering middleware ahead of it.
- **Account mapping is unspoofable.** `checkout.session.completed` maps solely via server-set `ClientReferenceId = user.Id`; later events via stored `StripeSubscriptionId`/`StripeCustomerId`, never email. No IDOR.
- **Idempotency is atomic + claim-before-mutate.** `ProcessedStripeEventStore` = insert-first / catch `DbUpdateException` on unique PK. But see [[recurring-gaps]]: the claim commit and the plan mutation are two separate `SaveChanges`, so a mutation failure after claim can strand a paying user (S-M2).
- **No free-Pro in prod.** DI in `ServiceCollectionExtensions`: `DirectBillingService` only in Development; Production-with-Stripe-off → `DisabledBillingService` (upgrade throws `BillingUnavailableException`, never grants Pro). `Enabled && !IsConfigured` fails loud naming missing keys without echoing values.
- **Downgrade only via verified `customer.subscription.deleted`**; `invoice.payment_failed` deliberately does not downgrade (dunning grace). No data deletion.

**S-H1 (WebhookSecret guard gap) — FIXED as of B-8 audit (2026-07-14).** `StripeSettings.IsConfigured` now requires `WebhookSecret` (`StripeSettings.cs:23-27`) and the fail-loud startup guard names it when missing (`Infrastructure ServiceCollectionExtensions.cs:117-129`). Do not re-flag unless it regresses.

**B-10 async-payment events (2026-07-14) — reviewed clean, don't re-flag.** `checkout.session.async_payment_succeeded` reuses the same shared grant handler (`OnCheckoutSessionPaidAsync`, renamed from `OnCheckoutCompletedAsync`) as the card path — one Pro-grant code path, same `ClientReferenceId`-only resolution, same `PaymentStatus` guard, same `ProcessOnceAsync` claim-then-mutate. `async_payment_failed` is a non-throwing, non-mutating logged no-op (logs event id + user-id reference only, no PII/payload). No double-grant, no grant-before-settlement, no divergent trust model. Dormant until delayed methods are enabled in Stripe.
