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

**Key gap found (S-H1): `WebhookSecret` is NOT in `StripeSettings.IsConfigured` nor the fail-loud guard** — only `SecretKey`+`ProPriceId` are. An empty `WebhookSecret` → forgeable webhook → free Pro. Re-check whether this was fixed on any future billing review.
