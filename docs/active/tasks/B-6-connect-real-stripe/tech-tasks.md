# B-6 · Connect real Stripe — Technical Tasks

Developer-ready plan for wiring the existing (dormant) billing seam to a real
Stripe account, verified end-to-end in **Stripe test mode**. Live cutover is
documented but explicitly NOT performed here (gated on legal §10/§11).

**Read `requirements.md` and the `## Owner decisions` block in `task.md` first — they
are binding.** Implement ONE task at a time, in order; verify each with
`dotnet build` + (frontend tasks) `npm run build`, and drive the flow against Stripe
test mode + the Stripe CLI before moving on. No automated test suite exists.

## Seam as it stands today (what you are extending, not inventing)

- `IBillingService` (`Tidansu.Domain/Interfaces/IBillingService.cs`) —
  `ChangePlanAsync(user, target)` + `HandleWebhookAsync(payload, signature)`.
  Two impls: `DirectBillingService` (dev default — flips plan immediately, no
  payment) and `StripeBillingService` (registered only when
  `StripeSettings.IsConfigured`).
- `StripeSettings` (`Tidansu.Infrastructure/Services/StripeSettings.cs`) —
  `Enabled, SecretKey, WebhookSecret, ProPriceId, SuccessUrl, CancelUrl`;
  `IsConfigured = Enabled && SecretKey && ProPriceId`.
- `Stripe.net` **52.0.0** already referenced in `Tidansu.Infrastructure.csproj`.
- `StripeBillingService` already: creates a `subscription` Checkout session with
  `ClientReferenceId = user.Id` + `CustomerEmail`; verifies the webhook signature
  via `EventUtility.ConstructEvent`; on `checkout.session.completed` promotes the
  user to Pro. **Gaps:** no idempotency, stores no customer/subscription id, has a
  `TODO` to cancel the Stripe subscription on downgrade, handles no cancel/lapse
  events, no Stripe Tax / consent / invoicing hooks.
- `User` (`Tidansu.Domain/Entities/User.cs`) — `Plan` (enum, mapped to `nvarchar(16)`),
  `SyncOn`. **No Stripe ids, no period-end.**
- DI selection + config live in
  `Tidansu.Infrastructure/Extensions/ServiceCollectionExtensions.cs`. Prod fail-loud
  config guards for JWT/SMTP live in
  `Tidansu.API/Extensions/WebApplicationBuilderExtensions.cs` — **mirror that pattern.**
- Downgrade→read-only is **already enforced** by `PlanPolicy.CheckSpaceMutation`
  (`Tidansu.Domain/Constants/PlanPolicy.cs`): over-cap content stays viewable and is
  rejected only when a mutation would push a capped dimension higher. B-6 does **not**
  touch that — it only has to make the webhook actually flip `Plan` back to Free.
- Frontend already consumes the checkout URL: `useSessionStore.setPlan` redirects to
  `res.data.checkoutUrl` when present; `PricingView.onUpgrade` → `session.setPlan('pro')`;
  paywall CTAs route to `PricingView`. `ChangePlanResult` DTO carries `CheckoutUrl`.
- `ErrorHandlingMiddleware` maps `PlanLimitException` → 403 `{plan:[reason]}`,
  `ValidationException` → 400.

**Design vocabulary (codebase-design):** keep `IBillingService` a **deep, narrow
seam** — the interface stays "change a plan / handle a provider event"; all Stripe
knowledge (event-type dispatch, customer/subscription mapping, idempotency, tax,
consent, invoicing) stays **inside** `StripeBillingService` and its collaborators, so
Application/Domain never learn a Stripe concept. The webhook's authority to grant Pro
is the highest-**leverage**, highest-risk seam in the app — treat it accordingly.

---

## 📋 Technical Tasks

### Backend — Domain

- [x] **add** Stripe billing fields to `User` in `src/Tidansu.Domain/Entities/User.cs`
      — `string? StripeCustomerId`, `string? StripeSubscriptionId`,
      `DateTimeOffset? CurrentPeriodEnd`, `bool CancelAtPeriodEnd`. (Needed to map
      later lifecycle events back to the right account — FR-7 — and to support
      end-of-period cancel UX — FR-9. All nullable/defaulted so existing rows migrate
      cleanly.) 🔴 billing/plan state.

- [x] **create** `ProcessedStripeEvent` entity in
      `src/Tidansu.Domain/Entities/ProcessedStripeEvent.cs` — `string Id` (the Stripe
      event id, primary key), `string Type`, `DateTimeOffset ProcessedAt`. (Idempotency
      ledger for FR-6; the unique PK is the dedupe key.) 🟠 webhook trust.

- [x] **create** `IProcessedStripeEventStore` in
      `src/Tidansu.Domain/Interfaces/IProcessedStripeEventStore.cs` — a single
      `Task<bool> TryMarkProcessedAsync(string eventId, string eventType, CancellationToken)`
      that returns `false` if the event was already recorded (atomic insert; caller
      skips processing on `false`). Keep it in Domain so Infrastructure owns the EF impl.

- [x] **create** `BillingUnavailableException` in
      `src/Tidansu.Domain/Exceptions/BillingUnavailableException.cs` — thrown when an
      upgrade is attempted while billing is deliberately off/misconfigured, so the app
      returns a clear "billing unavailable" outcome and never a silent free Pro (FR-2).

- [x] **modify** `IUserService` in `src/Tidansu.Domain/Interfaces/IUserService.cs` — add
      `Task<User?> FindByStripeSubscriptionIdAsync(string subscriptionId, CancellationToken)`
      and `Task<User?> FindByStripeCustomerIdAsync(string customerId, CancellationToken)`.
      (Cancel/lapse webhook events carry a subscription/customer id, not our user id —
      FR-7.) 🟠 user mapping.

### Backend — Application

- [x] **modify** `ChangePlanResult` in
      `src/Tidansu.Application/Account/Dtos/ChangePlanResult.cs` — add
      `bool CancellationScheduled` and `DateTimeOffset? ProAccessUntil`. (End-of-period
      cancel: user stays Pro until `ProAccessUntil`; the frontend must show this instead
      of flipping to Free immediately — FR-9.) **Contract change → triggers Kiota regen.**

- [x] **modify** `ChangePlanCommandHandler` in
      `src/Tidansu.Application/Account/Commands/ChangePlan/ChangePlanCommandHandler.cs`
      — surface the new `BillingChangeResult` fields (see Infrastructure task) into
      `ChangePlanResult` (`CancellationScheduled`, `ProAccessUntil`) and stop assuming a
      downgrade flips the plan synchronously. **Do not** add Stripe logic here — the
      handler stays provider-agnostic; it only maps the seam's result. (Layer discipline.)

### Backend — Infrastructure

- [x] **modify** `StripeSettings` in
      `src/Tidansu.Infrastructure/Services/StripeSettings.cs` — add the legal-hook
      config flags (all default `false`/blank, flippable in test mode): `bool TaxEnabled`
      (FR-10), `bool ConsentRequired` + `string? TermsOfServiceUrl` +
      `string? PrivacyUrl` + `string? WithdrawalUrl` (FR-11), `bool InvoicingEnabled`
      (FR-12). Keep `IsConfigured` as-is (these hooks are optional and gated at go-live).

- [x] **create** `DisabledBillingService` in
      `src/Tidansu.Infrastructure/Services/DisabledBillingService.cs` — implements
      `IBillingService`: `ChangePlanAsync(target=Pro)` throws `BillingUnavailableException`;
      `ChangePlanAsync(target=Free)` is a safe no-op (returns `Applied`);
      `HandleWebhookAsync` is a no-op. This is the **production** fallback when Stripe is
      off — it must **never** hand out Pro. (Replaces the current behaviour where
      `DirectBillingService`, which flips to Pro for free, was the prod fallback — FR-2.)
      🔴 free-Pro prevention.

- [x] **modify** the billing registration in
      `src/Tidansu.Infrastructure/Extensions/ServiceCollectionExtensions.cs` — select the
      impl by environment + config:
      `Enabled && IsConfigured` → `StripeBillingService`;
      `Enabled && !IsConfigured` → **fail loud at startup** (throw
      `InvalidOperationException` naming the missing `StripeSettings__*` key, never
      echoing values — mirror the JWT/SMTP guards);
      `!Enabled` in **Development** → `DirectBillingService` (documented dev convenience);
      `!Enabled` in **Production** → `DisabledBillingService` (deliberate off, no free Pro).
      🔴 billing config / free-Pro prevention.

- [x] **modify** `TidansuDbContext` in
      `src/Tidansu.Infrastructure/Persistence/TidansuDbContext.cs` — configure the new
      `User` columns (max-lengths on the id strings, e.g. 64/255) and add
      `DbSet<ProcessedStripeEvent> ProcessedStripeEvents` with `Id` as key
      (`HasMaxLength`) and an index on `StripeSubscriptionId`/`StripeCustomerId` on `User`
      (lookups in the webhook path). 🟠 schema.

- [x] **run** the migration for the User billing fields + ProcessedStripeEvent table —
      `dotnet ef migrations add StripeBillingFields --project src/Tidansu.Infrastructure --startup-project src/Tidansu.API`
      🔒 blocked by: the two Domain entity tasks + the DbContext task above.
      (Single migration is fine since both model changes land together; verify the
      generated `Up`/`Down` before applying.) 🟠 migration.

- [x] **create** `ProcessedStripeEventStore` in
      `src/Tidansu.Infrastructure/Repositories/ProcessedStripeEventStore.cs` implementing
      `IProcessedStripeEventStore` over `TidansuDbContext`: insert the event id and
      `SaveChanges`; on `DbUpdateException` from the unique PK, return `false`
      (already processed). This makes idempotency survive Stripe's at-least-once retries
      **atomically**, without a read-then-write race. Register it in
      `ServiceCollectionExtensions.cs`. 🔴 webhook idempotency.

- [x] **modify** `UserService` in `src/Tidansu.Infrastructure/Services/UserService.cs` —
      implement the two new lookups via `userManager.Users` LINQ
      (`FirstOrDefaultAsync` on `StripeSubscriptionId` / `StripeCustomerId`). 🟠 mapping.

- [x] **modify** `StripeBillingService` in
      `src/Tidansu.Infrastructure/Services/StripeBillingService.cs` — the core rework.
      One cohesive change (keep it internally structured — see Refactoring):
      - **Upgrade (FR-3):** unchanged shape, but set `ClientReferenceId = user.Id`
        (authoritative identity — FR-7; never trust client-supplied email) and, when
        flags are on, `AutomaticTax.Enabled` + `BillingAddressCollection="required"` +
        `CustomerUpdate`/`TaxIdCollection.Enabled` (FR-10), `ConsentCollection` +
        `CustomText`/terms URL (FR-11 provider-side), `InvoiceCreation`/subscription
        invoice settings (FR-12). All strictly behind the new `StripeSettings` flags so
        test mode passes with them off and can be flipped on without code changes.
      - **`checkout.session.completed` (FR-3/FR-7):** idempotency-guard via
        `IProcessedStripeEventStore.TryMarkProcessedAsync` **before** mutating; persist
        `StripeCustomerId`, `StripeSubscriptionId`, `CurrentPeriodEnd` on the user; set
        `Plan = Pro`. Never grant Pro if the signature check or the user lookup fails.
      - **`customer.subscription.deleted` (FR-8):** resolve the user by
        `StripeSubscriptionId`, flip to Free, clear `CancelAtPeriodEnd`. This is the
        single Free end-state for both user-cancel-at-period-end and dunning-exhausted
        lapse. Data is untouched (read-only enforcement is already in `PlanPolicy`).
      - **`customer.subscription.updated` (FR-9):** track `cancel_at_period_end` /
        `current_period_end` onto the user so the app can show "Pro until <date>".
      - **Payment lapse (FR-8, owner decision — after dunning):** do **not** downgrade on
        `invoice.payment_failed`; let Stripe's retry/dunning run and only downgrade when
        Stripe finally emits `customer.subscription.deleted` (retries exhausted). Add a
        short comment stating this so a future reader doesn't "fix" it to downgrade early.
      - **User-initiated downgrade (FR-9, owner decision — end of period):** in
        `ChangePlanAsync(target=Free)` for a Pro user with a `StripeSubscriptionId`, call
        `SubscriptionService.UpdateAsync(subId, { CancelAtPeriodEnd = true })` (replaces
        the `TODO`), set `CancelAtPeriodEnd=true`, keep `Plan=Pro`, and return
        `BillingChangeResult` carrying `CancellationScheduled=true` +
        `ProAccessUntil=CurrentPeriodEnd`. The plan flips to Free later via the
        `subscription.deleted` webhook. (Add the two fields to `BillingChangeResult` in
        `IBillingService.cs`.)
      🔴 webhook trust / plan mutation / user mapping / idempotency — Stage-3 pause point.

- [x] **modify** `BillingChangeResult` in
      `src/Tidansu.Domain/Interfaces/IBillingService.cs` — add
      `bool CancellationScheduled` and `DateTimeOffset? ProAccessUntil` (consumed by the
      handler above). Keep the `Applied`/`Redirect` factories; add a
      `ScheduledCancellation(DateTimeOffset until)` factory for readability.

### Backend — API

- [x] **modify** `ErrorHandlingMiddleware` in
      `src/Tidansu.API/Middlewares/ErrorHandlingMiddleware.cs` — catch
      `BillingUnavailableException` and return a clear, generic response (recommend
      **503 Service Unavailable** with `{ general: ["Billing is currently unavailable."] }`),
      logged at Warning without echoing config. Ensures FR-2's "clear message, no crash,
      stays Free". 🟠 billing.

- [x] **verify (no change expected)** the webhook receiver in
      `src/Tidansu.API/Controllers/BillingController.cs` still reads the **raw** request
      body (`StreamReader` on `Request.Body`) and forwards the `Stripe-Signature` header —
      signature verification depends on the exact raw bytes, so do **not** switch it to a
      model-bound DTO. Confirm no buffering middleware consumes the body first. 🔴 webhook
      signature integrity.

### Frontend — API client (Kiota)

- [x] **regenerate** the Kiota client — from `src/Tidansu.App` run `npm run build:api`
      **after** a fresh `dotnet build` of the API so the swagger DLL is current.
      🔒 blocked by: the `ChangePlanResult` DTO change.
      ⚠️ Tooling caveat (from project memory): `build:api` needs the version-matched
      `Swashbuckle.AspNetCore.Cli` (**10.1.2**, matching the API) + `Microsoft.OpenApi.Kiota`
      global tools on PATH; if `swagger tofile` fails with `'Startup' could not be found`,
      use the running-app fallback (boot the API with an empty `TidansuDb` connection
      string, `curl` `/swagger/v1/swagger.json` into `src/api/api.json`, then
      `fix-openapi.mjs` → `kiota generate` → `fix-generated.mjs`). Never hand-edit
      `src/api/apiClient/`.

### Frontend — Composables / Stores

- [x] **modify** `setPlan` in `src/Tidansu.App/src/stores/useSessionStore.ts` — handle the
      three outcomes from `changePlan`: (a) `checkoutUrl` present → revert optimistic flip
      and redirect (existing); (b) `cancellationScheduled` true → **do not** flip to Free,
      keep Pro and store `proAccessUntil` so the UI can show "Pro until <date>"
      (FR-9 end-of-period); (c) error response (e.g. 503 billing unavailable) → revert the
      optimistic flip and surface a user-visible "billing unavailable" message rather than
      only `console.error` (FR-2). Expose `proAccessUntil` / a `cancellationScheduled`
      flag from the store. 🟠 plan state.

### Frontend — Components / Views

- [x] **create** a pre-purchase consent/disclosure step component
      `src/Tidansu.App/src/components/pricing/CheckoutConsentStep.vue` (FR-11) — a modal/step
      shown before redirecting to Checkout that: renders the mandatory pre-purchase
      disclosures (total price incl. VAT, renewal terms, seller identity, how to
      cancel/withdraw), links to the legal pages (ToS/Regulamin, privacy,
      withdrawal/refund, imprint), captures the **express consent to immediate provision**
      + **acknowledgement of losing the 14-day withdrawal right** (a required checkbox),
      and gates a **"Subscribe & pay"** obligation-to-pay button that is disabled until
      consent is given. Copy is placeholder/lawyer-finalized later; the **step and its
      gating logic** are what B-6 delivers, behind a build/config flag so it can be turned
      on and test-verified now. Follow `create-frontend-component.md` + template-purity
      HARD RULE (all derived text/classes in `computed`, named handlers, variant-based
      styling, `@theme` tokens only). 🟠 consumer-law gate.
      🔒 blocked by: Kiota regen (needs the updated account plan client shape) —
      soft dependency only if it reads new fields.

- [x] **modify** `src/Tidansu.App/src/views/PricingView.vue` — route `onUpgrade` through the
      consent step (when the flag is on) before calling `session.setPlan('pro')`; and make
      `onDowngrade` reflect **end-of-period** semantics: on success show "You'll keep Pro
      until <ProAccessUntil>" rather than an immediate switch to Free. Keep all logic in
      `<script setup>` (named handlers + `computed`), no template logic. Also correct the
      existing FAQ copy if it now contradicts the confirmed cancel timing (it already says
      "you keep Pro until the period ends" — verify it matches). 🟠

- [x] **modify** `src/Tidansu.App/src/views/AccountView.vue` — surface billing state to the
      user: when a cancellation is scheduled, show "Pro until <date>, cancels then"; when
      billing is unavailable on an upgrade attempt, show the returned message. Use
      `computed` for all display strings (template purity). 🟠

### Backend — Docs (live-cutover readiness, FR-13 — documentation only, no live charge)

- [x] **create** `docs/active/tasks/B-6-connect-real-stripe/go-live-cutover.md` (or extend
      the existing `docs/legal/poland-payments-compliance.md` §10 reference) — a written,
      checklist-driven procedure that (a) shows going live requires **only configuration**:
      set live `StripeSettings__SecretKey` / `__WebhookSecret` / `__ProPriceId` +
      `Enabled=true` via environment, register the **live** Stripe webhook endpoint and
      paste its signing secret, flip the legal-hook flags (`TaxEnabled`, `ConsentRequired`,
      `InvoicingEnabled`) once copy/config is finalized; and (b) states in plain language
      that **flipping to live is gated on the §10 A–F checklist + §11 professional
      confirmation** in `docs/legal/poland-payments-compliance.md`, and that **no live
      charge is made as part of B-6**. 🔴 prevents accidental early go-live.

### Refactoring

- [x] **[refactor]** `StripeBillingService.HandleWebhookAsync` will grow to several event
      types — extract a small private per-event-type dispatch (e.g. a `switch` on
      `stripeEvent.Type` delegating to focused private methods
      `OnCheckoutCompleted` / `OnSubscriptionDeleted` / `OnSubscriptionUpdated`) so the
      method stays readable and each handler is independently reasoned about. Keep it all
      private inside the service — do **not** leak Stripe event types across the seam.
      Scope: this file only.

- [x] **[refactor]** verify template purity on every touched Vue file
      (`PricingView.vue`, `AccountView.vue`, new `CheckoutConsentStep.vue`,
      `useSessionStore.ts`) — no ternaries/concatenation/method-calls in templates, named
      handlers only, mapped `computed` arrays for any `v-for` that needs derived values.
      Scope: touched files only.

### Verification (no automated tests — build + manual drive)

- [x] **verify** `dotnet build` of the solution is green after the backend tasks.
- [x] **verify** `npm run build` (vue-tsc type-check) is green after the frontend tasks.
- [ ] **verify — happy path (FR-3/FR-5/FR-7):** with test-mode `sk_test_` keys + a test
      `ProPriceId` configured via env and `Enabled=true`, run the API + Stripe CLI
      (`stripe listen --forward-to localhost:5081/api/billing/webhook`). As a Free user,
      hit a cap → paywall → See Pro plans → (consent step if flag on) → Checkout, pay with
      `4242 4242 4242 4242`. Observe: redirected back to `SuccessUrl`; the webhook
      `checkout.session.completed` fires; the account is now **Pro** (can exceed former
      Free caps); `StripeCustomerId`/`StripeSubscriptionId` are persisted. Confirm Pro was
      granted by the webhook, **not** an optimistic client flip.
- [ ] **verify — webhook trust (FR-5/FR-6):** POST a payload with a bad/missing
      `Stripe-Signature` → rejected (400), no plan change. Re-send the same
      `checkout.session.completed` event twice via `stripe events resend <id>` → the second
      is a no-op (idempotency ledger), account stays correctly Pro, no error that would
      cause Stripe to keep retrying.
- [ ] **verify — cancel/downgrade end-of-period (FR-8/FR-9):** from the app, downgrade →
      confirm the Stripe subscription now has `cancel_at_period_end=true`, the app still
      shows **Pro until <date>** (not immediately Free), and no further renewal would
      charge. Then simulate period end (`stripe subscriptions cancel <sub_id>` or trigger
      `customer.subscription.deleted`) → account returns to **Free**; previously-created
      over-cap content (>2 spaces / >6 zones / >50 items) is **visible but read-only**,
      photos/sync re-gated (paywall `reason` fires); resubscribing restores Pro over the
      same data.
- [ ] **verify — safe-fail (FR-2) & no-regression (FR-14):** with Stripe **not** configured
      in a Production-like environment, an upgrade attempt yields a clear "billing
      unavailable" message and the account stays Free (no crash, no free Pro). With
      billing configured, a Free user hitting any cap still gets the paywall with the
      matching `reason`, and existing spaces/zones/items flows are unchanged.
- [ ] **verify — legal hooks (FR-10/FR-11/FR-12) in test mode:** flip `TaxEnabled`,
      `ConsentRequired`, `InvoicingEnabled` on and confirm: Checkout computes destination
      tax on the Pro price; the in-app consent step blocks activation until consent is
      given; a Stripe test invoice/receipt is produced. Flip them off and confirm the
      purchase flow still completes (hooks are optional/gated).

---

## 🔒 Security Considerations

- **Forged/unverified webhook grants Pro.** The webhook is the *only* authority that
  promotes Free→Pro; a gap = free Pro for attackers. 🔴 Critical.
  - [ ] Keep `EventUtility.ConstructEvent(payload, signature, WebhookSecret)` as the first
        thing the handler does; any signature failure → reject, mutate nothing. Never move
        plan mutation ahead of verification. Confirm the controller passes the **raw** body.

- **`DirectBillingService` reachable in production = free Pro for everyone.** Today the
  fallback when Stripe is unconfigured flips the plan directly with no payment. 🔴 Critical.
  - [ ] Ensure Production selects `DisabledBillingService` (never `DirectBillingService`);
        `Enabled && !IsConfigured` in Production fails loud at startup.

- **Wrong-account upgrade/downgrade via spoofable mapping.** If the mapping used a
  client-supplied email/value, a user could upgrade/downgrade someone else. 🔴 Critical.
  - [ ] Derive the account solely from `ClientReferenceId = user.Id` (authenticated Tidansu
        identity carried into Checkout) on `checkout.session.completed`; resolve later
        events by the stored `StripeSubscriptionId`/`StripeCustomerId`, never by email.

- **At-least-once retries double-process (double flip / flip-flop).** 🟠 High.
  - [ ] Gate every mutating event on `TryMarkProcessedAsync` with an atomic unique-PK
        insert; second delivery is a no-op. Return 200 to Stripe for already-handled events
        so it stops retrying.

- **Secrets in source.** Stripe secret + webhook signing secret are bearer credentials. 🔴 Critical.
  - [ ] Keep all keys in environment/user-secrets (`StripeSettings__*`), never committed;
        dev appsettings keeps blank placeholders. Fail-loud guards must **name** the missing
        key, never echo its value (mirror the JWT/SMTP guards + the
        `config-fail-loud-and-secret-logging` convention).

- **Webhook endpoint is `[AllowAnonymous]`** (correct — Stripe is unauthenticated), so
  signature verification is the *sole* gate. 🟠 High.
  - [ ] Do not add any code path in `HandleWebhookAsync` that mutates state before
        `ConstructEvent` succeeds.

- **Sensitive data in logs.** 🟡 Medium.
  - [ ] Log user id + event type + Stripe ids only; never log the raw payload, signature,
        or any card/customer PII.

## 📈 Scalability / Correctness Considerations

- **Read-then-write idempotency race.** A naive "select then insert" lets two concurrent
  retries both pass. Use the atomic unique-PK insert + `DbUpdateException` catch instead.
  - [ ] Implement `ProcessedStripeEventStore` as insert-first, catch-duplicate.

- **Webhook user lookup is a query, not a `UserManager.FindById`.** `FindByStripeSubscriptionId`
  scans `Users` — ensure an index exists so it stays O(log n).
  - [ ] Add the index on `User.StripeSubscriptionId` (and `StripeCustomerId`) in the DbContext.

- **`AsNoTracking` / update semantics.** The webhook loads a user and mutates it; it must
  be tracked (via `UserManager`) so `UpdateAsync` persists. Do not switch this lookup to
  `AsNoTracking`.
  - [ ] Confirm the mutate path uses a tracked entity.

- **Out-of-order events.** `subscription.updated` (cancel scheduled) may arrive before or
  after `checkout.session.completed`. Store fields idempotently and let the final
  `subscription.deleted` be the authority for Free.
  - [ ] Make each handler tolerant of a missing/older sibling event (null-safe lookups,
        no assumption of ordering).

- **Migration on existing data.** New `User` columns must be nullable/defaulted so the
  existing rows migrate without a manual backfill.
  - [ ] Review the generated migration `Up`/`Down` before applying.

## 📦 New Dependencies

No new dependencies required. `Stripe.net` **52.0.0** is already referenced in
`src/Tidansu.Infrastructure/Tidansu.Infrastructure.csproj`; all Checkout, Subscription,
Tax, ConsentCollection, TaxIdCollection and InvoiceCreation options used here are in that
SDK. Kiota regen relies on the existing (version-matched) global CLI tools — see the
regen task's caveat.

## ❓ Open Questions

1. **Idempotency store shape.** Plan uses a dedicated `ProcessedStripeEvent` table (clean,
   queryable, survives concurrent retries via unique PK). Confirm the owner is fine with a
   new table vs. a column/loose approach. *(Recommendation: keep the table.)*
2. **Success / cancel return UX (task.md OQ-6).** `SuccessUrl` today is
   `/account?upgraded=1`, `CancelUrl` is `/pricing`. Confirm whether a successful purchase
   should land on a "Welcome to Pro" screen or return to the originally-gated action, and
   whether cancel should return to the specific space. Affects `PricingView`/`AccountView`
   copy and the redirect targets (env-configured).
3. **Launch VAT posture (OQ-2/OQ-5).** Whether Stripe Tax (`TaxEnabled`) is *on* at go-live
   (VAT-OSS from day one) vs. relying on the €10k grace is a business/accountant decision.
   B-6 builds the hook off-by-default and test-verifiable; the go-live flag value is the
   open item. Does not block the build.
4. **Consent step: in-app vs. Stripe-hosted split (FR-11).** Stripe hosted Checkout controls
   its own submit button label, so the obligation-to-pay "Subscribe & pay" button + the
   explicit withdrawal-waiver acknowledgement are planned as an **in-app pre-Checkout step**,
   with Stripe `ConsentCollection`/terms URL as the provider-side complement. Confirm this
   division satisfies the lawyer's §6 requirements, or whether more must live on Stripe's
   page. Final legal copy is downstream regardless.
5. **Currency / localized pricing (OQ-5/OQ-7).** Single `ProPriceId` is assumed (one price).
   If localized pricing is wanted before go-live it interacts with VAT presentation and
   invoicing — out of scope for B-6 but flagged.
6. **Interface exploration (optional).** If the team wants to pressure-test the widened
   `IBillingService` / `BillingChangeResult` shape (upgrade vs. redirect vs.
   scheduled-cancellation vs. unavailable is becoming a 4-way result), the top-level
   `/design-an-interface` skill could explore alternatives before implementation. Not
   required — the proposed shape is a straightforward extension of the existing seam.
</content>
</invoke>
