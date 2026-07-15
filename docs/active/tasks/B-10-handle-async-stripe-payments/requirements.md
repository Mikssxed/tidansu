### 📋 Backlog Item
Handle Stripe's delayed/async payment settlement events —
`checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`
— so a buyer using a delayed-notification payment method (e.g. SEPA debit, some
wallets) is granted Pro only once payment actually settles, and stays on Free if it
ultimately fails, without regressing the existing card path.

### 🎯 Product Context Summary
Today Pro is granted only by `checkout.session.completed` when its `PaymentStatus`
is already `paid`/`no_payment_required` — correct for cards, but delayed methods can
fire that event with payment still pending and only settle later. The webhook is the
single authority that grants/revokes Pro (`StripeBillingService.HandleWebhookAsync`),
so this item extends it with two more event handlers that reuse the same
authoritative-identity resolution (`Session.ClientReferenceId`), idempotency ledger
(`ProcessOnceAsync`), and claim-then-mutate transaction already proven for the card
path. This is **defensive/dormant work**: the product is card-only today, so neither
event will ever fire in production until delayed methods are deliberately enabled in
Stripe — but without this handling, enabling them later would let a buyer pay and
never receive Pro.

### 🔑 Core Functional Areas
- Grant Pro on delayed-payment settlement (`async_payment_succeeded`)
- Stay on Free on delayed-payment failure (`async_payment_failed`)
- Idempotency and non-regression of the existing signature-first / claim-then-mutate webhook contract
- Observability for a path that is dormant until delayed methods are turned on

---

### Functional Requirements

**Async payment settlement**

- **FR-1**: When Stripe reports that a checkout session's delayed payment has
  settled (`checkout.session.async_payment_succeeded`), the account referenced by
  that session is granted Pro, using the exact same account-resolution and
  grant logic as the existing card path.
  - *Business rationale*: the buyer already paid via a delayed method at
    checkout; they must receive Pro once funds actually clear, not never.
  - *Priority*: Phase 1 (this is the whole item — no further phases planned)
  - *Plan & gate*: Grants Pro. No new paywall `reason` is introduced — this is
    the billing-grant path itself, not a capability gate.
  - *Constraints/Rules*: Resolve the account **solely** from the session's
    `ClientReferenceId` (never client-supplied email) — the same rule already
    enforced for `checkout.session.completed`. The event arrives already-paid,
    so the existing `PaymentStatus` guard in the completed handler is harmless
    to reuse (it will always pass). Must be claimed via `ProcessOnceAsync`
    before mutating, so a Stripe at-least-once retry of the same event id is a
    no-op. An unknown or missing `ClientReferenceId` must log a warning and not
    mutate anything (matches the completed handler's behaviour).
  - *Acceptance criteria*:
    - Given a valid, first-time `checkout.session.async_payment_succeeded` event
      with a `ClientReferenceId` matching an existing user, that user's plan
      becomes Pro and their Stripe customer/subscription id and period end are
      recorded, exactly as the completed handler does today.
    - Given the same event id delivered again (Stripe retry), no second
      mutation occurs and no error surfaces.
    - Given an event with a missing or unresolvable `ClientReferenceId`, the
      account is untouched and a warning is logged; the webhook still acks
      success (200) so Stripe does not retry indefinitely.

**Async payment failure**

- **FR-2**: When Stripe reports that a checkout session's delayed payment has
  failed to settle (`checkout.session.async_payment_failed`), the referenced
  account is left exactly as it was (Free) — no plan mutation occurs.
  - *Business rationale*: a failed delayed payment must never grant a
    capability the buyer didn't end up paying for; there is nothing to
    revoke since Pro was never granted for this session.
  - *Priority*: Phase 1
  - *Plan & gate*: No change — account remains Free (or whatever plan it was
    already on). No paywall interaction.
  - *Constraints/Rules*: Must not throw or return a non-2xx status — Stripe
    would otherwise retry an event that can never succeed. Recommended: still
    route through `ProcessOnceAsync` so every mutating-class event type gets
    the same idempotency-ledger/ack story, even though the handler body itself
    performs no mutation (see Open Questions for the alternative).
  - *Acceptance criteria*:
    - Given a `checkout.session.async_payment_failed` event, the referenced
      account's plan is unchanged after processing.
    - The event is logged (account reference + Stripe event id) so the failure
      is visible in telemetry even though nothing user-facing happens.
    - The webhook acks success (200) so Stripe stops retrying.
    - Redelivery of the same failed-payment event id remains a no-op.

**Non-regression**

- **FR-3**: Adding the two new handlers must not change the behaviour of the
  existing `checkout.session.completed`, `customer.subscription.updated`, or
  `customer.subscription.deleted` handling in any way.
  - *Business rationale*: the card path is the only path that exists in
    production today and has already been built, reviewed, and hardened
    (B-6, B-8, B-9); this item must add, not touch.
  - *Priority*: Phase 1
  - *Plan & gate*: N/A — behavioural guardrail, not a new capability.
  - *Constraints/Rules*: Signature-verification-first ordering and the
    claim-then-mutate single-transaction unit of work
    (`ProcessOnceAsync`) apply unchanged to all event types, existing and new.
  - *Acceptance criteria*: `checkout.session.completed` still grants Pro only
    when `PaymentStatus` is `paid` or `no_payment_required`, and still ignores
    the event (no grant) when status is otherwise (e.g. pending on a delayed
    method) — that "not yet paid, don't promote" branch is exactly why FR-1
    exists as a separate, later event.

**Observability**

- **FR-4**: Both new event types produce a clear, greppable log trail,
  since this path is dormant (no delayed methods enabled) until a future
  product decision turns them on.
  - *Business rationale*: logs are the only signal available to confirm the
    dormant path behaves correctly whenever delayed methods are eventually
    enabled, without waiting for a support ticket to notice a problem.
  - *Priority*: Phase 1
  - *Plan & gate*: N/A
  - *Constraints/Rules*: Match the existing handlers' log levels — info on a
    successful grant, warning on an unresolvable/unknown account reference,
    info on the failure no-op — and always include the Stripe event id and the
    account reference for traceability.
  - *Acceptance criteria*: A grant via `async_payment_succeeded` logs the same
    shape of message as a grant via `completed` (user id, subscription id). A
    no-op via `async_payment_failed` logs the account reference and event id
    at info/warning level. Neither handler ever logs the raw webhook payload.

---

### ⚠️ Key Business Considerations
- **This is pure insurance, not urgent.** The product is card-only today; both
  events are unreachable in production until delayed payment methods are
  deliberately enabled in the Stripe Dashboard/checkout config — a separate,
  future product decision. Priority stays low (P3) accordingly.
- **Consistency of trust model.** The account-resolution rule (never trust
  client-supplied identity, only the authenticated `ClientReferenceId`) must
  hold for every event type that can grant Pro, not just the original one —
  this item is as much about not creating a second, divergent grant path as it
  is about adding a feature.
- **Silent failure matches existing product behaviour.** The app already lets
  `invoice.payment_failed` fail silently (dunning runs behind the scenes with
  no user-facing action) rather than surface every billing hiccup — treating
  `async_payment_failed` the same way (silent, logged, no notification) keeps
  billing failure handling consistent rather than introducing a one-off
  notification just for this path.

### 🚫 Out of Scope (Phase 1)
- Actually enabling SEPA debit, wallets, or any other delayed-notification
  payment method in Stripe Checkout — that is a separate go-live/product
  decision (see `docs/legal/poland-payments-compliance.md`), not part of this
  item.
- User-facing notification/email when a delayed payment fails.
- Any change to `invoice.payment_failed` or subscription lifecycle
  (`customer.subscription.updated`/`deleted`) handling.
- New paywall `reason` or any change to plan/limit rules.
- Contract or Kiota client changes — this is an internal webhook-dispatch
  edit only; no new API surface.

### ❓ Open Questions for Product Owner
1. **Notification on failure**: should `async_payment_failed` ever notify the
   user (e.g. "your payment didn't go through, please retry"), or is a silent
   stay-on-Free the accepted behaviour? *Recommendation*: silent for Phase 1,
   consistent with how `invoice.payment_failed` is already handled silently —
   revisit only if/when delayed methods are actually enabled and real users
   start hitting this path.
2. **Ledger routing for the failure event**: task.md leaves it to the
   tech-lead whether `async_payment_failed` should route through
   `ProcessOnceAsync` (ledger claim + transaction, consistent with every other
   handled event) or be a lighter ack-only default with no ledger entry.
   *Recommendation*: route it through `ProcessOnceAsync` anyway — the handler
   body is a no-op, but the ledger entry gives a consistent audit trail and
   costs one extra row, at no risk since there's nothing to roll back.
3. **`no_payment_required` on the async event**: is `no_payment_required` ever
   a possible `PaymentStatus` on `async_payment_succeeded`, or is that status
   exclusive to the synchronous `completed` event? *Assumption*: exclusive to
   `completed` (trials/100%-off coupons settle synchronously), so the async
   handler doesn't need that branch — confirm during tech planning if Stripe's
   docs say otherwise.
