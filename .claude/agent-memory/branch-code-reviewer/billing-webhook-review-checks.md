---
name: billing-webhook-review-checks
description: Two subtle Stripe-webhook failure modes to re-check on any StripeBillingService / billing-config change
metadata:
  type: feedback
---

When reviewing changes to the Stripe billing seam (`StripeBillingService`,
`StripeSettings`, `ServiceCollectionExtensions` billing selection,
`ProcessedStripeEventStore`), check these two failure modes — both surfaced in the B-6
review and neither is caught by `dotnet build` or the type gate.

**Why:** the webhook is the sole authority that grants Pro; a silent gap = customer
charged but never upgraded, with no self-heal.

**How to apply:**
1. **Config completeness of the fail-loud guard.** `IsConfigured` and the startup guard
   must require *every* key the happy path needs, not just `SecretKey`/`ProPriceId`. A
   missing `WebhookSecret` boots fine and lets Checkout charge, but every webhook then
   fails `EventUtility.ConstructEvent` → account never flips to Pro. Confirm the guard
   names each missing `StripeSettings__*` key (without echoing values).
2. **Idempotency-claim vs mutation transaction boundary.** If `TryMarkProcessedAsync`
   commits the ledger row in its own `SaveChanges` *before* the user-mutation
   `SaveChanges`, a transient failure between them permanently skips the upgrade on
   Stripe's retry (the ledger already says "processed"). Claim + mutation must be one
   transaction (or record the event only after a successful, idempotent mutation).

High-risk files for billing review: `StripeBillingService.cs`,
`ServiceCollectionExtensions.cs` (billing DI selection + fail-loud guard),
`ProcessedStripeEventStore.cs`, `StripeSettings.cs`. See also [[email-delivery-failure-path]]
for the sibling fail-loud/secret-safe pattern.
