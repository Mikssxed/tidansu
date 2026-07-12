---
name: billing-stripe-webhook-trust-seam
description: Tidansu billing seam gotchas — the free-Pro prod leak, webhook-as-sole-Pro-authority, idempotency, and where downgrade read-only actually lives
metadata:
  type: project
---

The Tidansu billing seam (`IBillingService` → `StripeBillingService` /
`DirectBillingService`, `/api/billing/webhook`) has three non-obvious traps a plan
touching billing must handle. High-risk files: `StripeBillingService.cs`,
`ServiceCollectionExtensions.cs` (DI selection), `ErrorHandlingMiddleware.cs`.

**Why:** billing is a Stage-3 pause point + Stage-4 security review; a gap here = free
Pro for attackers, wrong-account upgrades, or a downed app.

**How to apply:**
- **Free-Pro prod leak.** The DI fallback when Stripe is unconfigured is
  `DirectBillingService`, which flips `User.Plan` to Pro with **no payment**. That is
  fine in Development but in Production it is free Pro for everyone. Any billing plan
  must route Production-off to a `DisabledBillingService` (clean "billing unavailable",
  never a flip) and fail loud on `Enabled && !IsConfigured` — mirror the JWT/SMTP
  guards. See [[arch-config-fail-loud-and-secret-logging]].
- **Webhook is the ONLY Pro authority.** Never grant Pro from `ChangePlanAsync` /
  client input — only from a signature-verified `checkout.session.completed`
  (`EventUtility.ConstructEvent` must run first; controller must forward the RAW body).
  Map the account by `ClientReferenceId = user.Id` (authenticated identity), never by a
  client-supplied email. Later lifecycle events carry only a Stripe
  customer/subscription id → store those ids on `User` to resolve them.
- **Idempotency must be atomic.** Stripe is at-least-once; a read-then-write dedupe
  races. Use a unique-PK insert (a `ProcessedStripeEvent` id) and catch the duplicate.
- **Downgrade read-only needs no new code.** `PlanPolicy.CheckSpaceMutation`
  (`Tidansu.Domain/Constants/PlanPolicy.cs`) already keeps over-cap content viewable and
  rejects only mutations that push a capped dimension higher. A Pro→Free path only has
  to flip `User.Plan`; the gate is already there. `PlanLimitException` → 403
  `{plan:[reason]}` is wired in `ErrorHandlingMiddleware`.
- **Frontend already consumes checkout redirects:** `useSessionStore.setPlan` redirects
  on `res.data.checkoutUrl`. Adding fields to `ChangePlanResult` (e.g. end-of-period
  cancel state) is a **contract change → Kiota regen** (see [[kiota-regen-tooling]] in
  auto-memory: version-matched swagger CLI + running-app fallback).
</content>
