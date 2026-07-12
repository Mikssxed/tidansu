# Code Review: B-6 · Connect real Stripe

**Date**: 2026-07-12
**Reviewer**: branch-code-reviewer agent
**Diff base**: origin/main (== HEAD `e370c12`; all B-6 work is uncommitted in the working tree)
**Files changed**: 24 modified + 12 new (backend seam rework, migration, Kiota regen, 3 Vue views/components, config)

## Summary
Solid, security-conscious implementation of the Stripe seam. The load-bearing security
invariants from the tech plan are all honored: signature-first webhook verification, the
free-Pro-in-prod hole is closed by `DisabledBillingService`, account mapping is derived
from the authenticated `ClientReferenceId`/stored ids (never email), secrets are never
logged, and the migration is additive/zero-loss. The seam stays clean — no Stripe type
leaks past `IBillingService` into Application/Domain. Both static gates are green
(`dotnet build` exit 0, `npm run build` exit 0), verified independently.

No Critical issues. Two backend Major findings concern operational robustness (a
misconfiguration that silently breaks the paid→Pro path, and a lost-upgrade window in the
idempotency ordering), plus one Major on the consent-step price disclosure. The three
approved Stripe.net-52 deviations are implemented as documented and look correct.

## 🔴 Critical (must fix before merge)
None.

## 🟠 Major (strongly recommended)

### [M1] Missing `WebhookSecret` is not caught — Checkout charges but Pro is never granted
**File**: `src/Tidansu.Infrastructure/Services/StripeSettings.cs:23-26`,
`src/Tidansu.Infrastructure/Extensions/ServiceCollectionExtensions.cs:107-116`
**Category**: Correctness / Functional
**Description**: `IsConfigured = Enabled && SecretKey && ProPriceId` and the fail-loud
startup guard only name `StripeSettings__SecretKey` / `StripeSettings__ProPriceId`.
`WebhookSecret` is required nowhere. A deploy with `Enabled=true`, a secret key and a
price id but a blank/forgotten `WebhookSecret` boots cleanly and registers
`StripeBillingService`. Checkout works and the customer is charged, but every webhook then
fails `EventUtility.ConstructEvent(payload, signature, WebhookSecret)`
(`StripeBillingService.cs:143`) → `ValidationException` → 400 to Stripe → the account is
*never* upgraded. The webhook is the sole authority that grants Pro, so a missing signing
secret silently breaks the entire happy path. This is exactly the class of config omission
the fail-loud pattern exists to catch.
**Recommendation**: Add `WebhookSecret` to the fail-loud guard (and, ideally, to
`IsConfigured`), naming `StripeSettings__WebhookSecret` when blank — mirroring the
SecretKey/ProPriceId branch. It caught the test drives; better it also fails at boot.

### [M2] Idempotency claim commits in a separate transaction from the plan mutation — lost upgrade on a transient failure
**File**: `src/Tidansu.Infrastructure/Services/StripeBillingService.cs:155-156, 196-219`,
`src/Tidansu.Infrastructure/Repositories/ProcessedStripeEventStore.cs:22-24`
**Category**: Correctness
**Description**: `AlreadyProcessedAsync` calls `TryMarkProcessedAsync`, which does its own
`SaveChangesAsync` and **commits the event row**. Only afterwards does
`OnCheckoutCompletedAsync` mutate the user via a *second* `SaveChanges`
(`UserService.UpdateAsync` → `userManager.UpdateAsync`). If that second write throws
(transient deadlock/timeout, an Identity validation failure, etc.), the exception
propagates and Stripe retries the same event id — but the ledger row is already committed,
so the retry short-circuits as "already processed" and the upgrade is permanently lost. The
customer paid and never gets Pro, with no self-heal and no alert. The "claim before mutate"
ordering guards concurrent duplicate deliveries but converts a transient failure into a
silent at-most-once loss.
**Recommendation**: Make claim + mutation atomic. Wrap the mutating branch in an explicit
`IDbContextTransaction` (both share the scoped `TidansuDbContext`): insert the ledger row
first (dup → rollback + skip), mutate the user, then commit — so any failure rolls the
claim back and Stripe's retry re-processes cleanly. (The plan mutations are already
idempotent, so recording the event *after* a successful mutation is an acceptable
alternative, but a single transaction preserves the atomic-dedupe guarantee.)

### [M3] Consent-step price disclosure and billing toggle present month/year pricing the seam can't honor
**File**: `src/Tidansu.App/src/components/pricing/CheckoutConsentStep.vue:124-154`,
`src/Tidansu.App/src/views/PricingView.vue:28-50, 138-143`
**Category**: Functional / consumer-law
**Description**: The UI offers a Monthly/Yearly toggle and the consent step discloses a
period-specific "Total, incl. VAT" (`$X / year` vs `$X / month`, from static
`data/plans`). But the billing seam charges a single `ProPriceId`
(`StripeBillingService.cs:106`) with no notion of billing period — the toggle is
display-only. So the mandatory pre-purchase price disclosure (the entire point of FR-11)
can state a total that differs from what Stripe actually charges. Copy is placeholder and
the flag is off by default, so this is not a today-defect, but it is a truthfulness gap
that must be closed before `VITE_CHECKOUT_CONSENT` is enabled or go-live.
**Recommendation**: Before enabling the consent flag, reconcile pricing: either introduce
month/year price ids and pass the selected one into checkout, or drop the yearly toggle and
disclose only the single real price. Ties into OQ5 (currency/localized pricing) — flag it
in `go-live-cutover.md` as a consent-flow prerequisite.

## 🟡 Minor (nice-to-have)

### [N1] `checkout.session.completed` grants Pro without checking `PaymentStatus`
**File**: `src/Tidansu.Infrastructure/Services/StripeBillingService.cs:196-216`
**Description**: The handler grants Pro on the completed event without inspecting
`session.PaymentStatus`. For immediate card payments this is fine, but delayed-notification
methods (SEPA, some wallets) can emit `completed` with `payment_status = "unpaid"` before
funds settle, granting Pro pre-payment. Card-only test mode won't surface this.
**Recommendation**: Guard on `session.PaymentStatus == "paid"` (and/or handle
`checkout.session.async_payment_succeeded`) if non-card methods are ever enabled.

### [N2] A cancel-scheduled Pro user cannot resume/un-cancel
**File**: `src/Tidansu.Infrastructure/Services/StripeBillingService.cs:47-49`
**Description**: `ChangePlanAsync(target=Pro)` short-circuits to `Applied` when the user is
already Pro. A user who scheduled an end-of-period cancel (`CancelAtPeriodEnd=true`) is
still Pro, so there is no path to clear `cancel_at_period_end` and resume — AccountView only
shows "Manage billing"/"Switch to Free" for Pro users. Out of scope for B-6 but worth a
follow-up.
**Recommendation**: A future "Resume Pro" path that calls
`SubscriptionService.UpdateAsync(subId, { CancelAtPeriodEnd = false })` and clears the flag.

## 🧭 Convention Violations (project rules)
- [ ] `src/Tidansu.App/src/views/PricingView.vue:84,90` — `:current="currentPlan === 'free'"`
  and `:current="currentPlan === 'pro'"` are equality comparisons producing a value in the
  `<template>`. The template-purity HARD RULE allows only plain property/getter access;
  derive `isFreeCurrent`/`isProCurrent` (or a mapped array) as `computed` and bind those.
  (Everything else in the three touched Vue files is clean — mapped `computed` arrays for
  `v-for`, named handlers, `@theme` tokens only, no hardcoded hex; the `text-[13px]`/
  `p-[calc(18px*var(--pad))]` brackets are the sanctioned pixel/`--pad` pattern, not
  violations.)

## 🏗️ Architecture Notes
- Seam discipline is excellent: all Stripe knowledge (event dispatch, mapping, idempotency,
  tax/consent/invoicing hooks) is private inside `StripeBillingService`; Application/Domain
  see only `User`, `Plan`, `BillingChangeResult`, and raw payload/signature strings. The
  per-event private-handler refactor keeps `HandleWebhookAsync` readable.
- The three Stripe.net-52 deviations are implemented as documented and look correct: period
  end read from `SubscriptionItem.CurrentPeriodEnd` via the null-safe `PeriodEndOf`; no
  `CustomerUpdate`; invoicing via `TaxIdCollection` + Dashboard template.
- Migration `StripeBillingFields` is additive and zero-loss on `Up` (nullable columns,
  defaulted bool, new table, two lookup indexes); `Down` is a normal rollback. Safe to apply
  to existing installs.
- `DateTimeOffset` mapping in `PeriodEndOf` (`new DateTimeOffset(item.CurrentPeriodEnd,
  TimeSpan.Zero)`) relies on Stripe.net returning UTC `DateTime`s — true today; a
  `DateTime.SpecifyKind(..., Utc)` would make it defensively explicit. Nit only.

## 👍 Positives
- Signature verification is unconditionally first; nothing mutates before `ConstructEvent`
  succeeds, and failures log the fact (not the payload/signature).
- Free-Pro-in-prod hole genuinely closed: prod-off resolves `DisabledBillingService`, which
  throws `BillingUnavailableException` on upgrade and no-ops downgrade; `Enabled &&
  !IsConfigured` fails loud at boot naming the missing key without echoing values.
- Account mapping is derived solely from the authenticated `ClientReferenceId` on checkout
  and from stored subscription/customer ids on later events — never client-supplied email.
- `customer.subscription.deleted` is the single Free end-state; `invoice.payment_failed` is a
  deliberate, well-commented no-op honoring the dunning decision.
- `ProcessedStripeEventStore` uses insert-first / catch-`DbUpdateException` with
  `ChangeTracker.Clear()` so the context stays usable — correct atomic-dedupe shape (see M2
  for the transaction-boundary caveat).
- Frontend `setPlan` cleanly reconciles all three outcomes (checkout redirect / scheduled
  cancel / direct apply) plus a user-visible billing-unavailable message instead of a silent
  `console.error`; Kiota regen is clean and correctly typed (`proAccessUntil?: Date`), no
  hand-edits.
- Legal hooks (Tax / ConsentCollection / TaxIdCollection) are all strictly behind
  off-by-default flags; test mode passes with them off. FAQ cancel copy matches the confirmed
  end-of-period semantics.

## Action Checklist
- [ ] [M1] Add `WebhookSecret` to the fail-loud startup guard (and `IsConfigured`).
- [ ] [M2] Wrap the idempotency claim + plan mutation in one DB transaction so a failed
      mutation rolls the claim back and Stripe's retry re-processes.
- [ ] [M3] Reconcile month/year disclosure with the single `ProPriceId` before enabling the
      consent flag / go-live (note in `go-live-cutover.md`).
- [ ] [N1] Optionally guard `OnCheckoutCompletedAsync` on `PaymentStatus == "paid"` before
      non-card methods are enabled.
- [ ] [N2] Follow-up: add a "Resume Pro" path to clear a scheduled cancellation.
- [ ] [conv] Move `currentPlan === 'free'/'pro'` out of `PricingView.vue` template into
      `computed`.

_Note: the 5 interactive Stripe test-mode drives remain owner tasks (SETUP.md) and are
correctly deferred — not treated as defects here. M1 and M2 are the code paths most likely
to bite when those drives run._
