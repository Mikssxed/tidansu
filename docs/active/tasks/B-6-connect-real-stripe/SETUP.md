# B-6 · Owner setup & test-mode verification (pending)

The B-6 code is built and both static gates are green (`dotnet build`,
`npm run build`). The **end-to-end Stripe test-mode drives cannot be run in the build
environment** — they need a Stripe account, `sk_test_` keys, the Stripe CLI, and a
running SQL Server LocalDB with the `StripeBillingFields` migration applied. This file
is the owner runbook to finish verification. Nothing here charges real money — it is
all **Stripe test mode**.

## 1. One-time setup

1. **Stripe account → test mode.** In the Dashboard (toggle **Test mode** on):
   - Create a **Pro** product + recurring **price** → copy its `price_…` id.
   - Developers → API keys → copy the **test** secret key (`sk_test_…`).
2. **Stripe CLI.** Install (`https://stripe.com/docs/stripe-cli`), then `stripe login`.
3. **Local secrets** (do NOT commit). From `src/Tidansu.API`, use user-secrets or env:
   ```
   dotnet user-secrets set "StripeSettings:Enabled" "true"
   dotnet user-secrets set "StripeSettings:SecretKey" "sk_test_…"
   dotnet user-secrets set "StripeSettings:ProPriceId" "price_…"
   # WebhookSecret is printed by `stripe listen` in step 3 below — set it then:
   dotnet user-secrets set "StripeSettings:WebhookSecret" "whsec_…"
   ```
   `SuccessUrl`/`CancelUrl` already default to the local frontend in
   `appsettings.Development.json`.
4. **Database.** Ensure LocalDB is available and apply migrations (the API auto-migrates
   on boot with a non-empty `TidansuDb` connection string), or run:
   `dotnet ef database update --project src/Tidansu.Infrastructure --startup-project src/Tidansu.API`.

## 2. Run the stack

```
# terminal 1 — API
dotnet run --project src/Tidansu.API
# terminal 2 — forward Stripe events to the local webhook (prints whsec_… → set it, restart API)
stripe listen --forward-to localhost:5081/api/billing/webhook
# terminal 3 — frontend
cd src/Tidansu.App && npm run dev
```

## 3. Verification checklist (maps to tech-tasks.md "Verification")

- [ ] **Happy path (FR-3/5/7).** As a Free user, hit a cap → paywall → See Pro plans →
      Checkout, pay with `4242 4242 4242 4242`. Back on `SuccessUrl` the account is
      **Pro** (can exceed former Free caps). Confirm Pro came from the
      `checkout.session.completed` **webhook** (watch terminal 2), not an optimistic
      client flip; `StripeCustomerId`/`StripeSubscriptionId` are persisted on the user.
- [ ] **Webhook trust (FR-5/6).** `curl` the webhook with a bad/missing
      `Stripe-Signature` → **400**, no plan change. Re-deliver the same event
      (`stripe events resend <id>`) → second delivery is a no-op (idempotency ledger:
      row in `ProcessedStripeEvents`), account stays correctly Pro, Stripe gets 200.
- [ ] **Cancel end-of-period (FR-8/9).** Downgrade from the app → the Stripe
      subscription shows `cancel_at_period_end=true`, the app still shows **"Pro until
      <date>"** (not immediately Free). Then force period end
      (`stripe subscriptions cancel <sub_id>` / trigger `customer.subscription.deleted`)
      → account returns to **Free**; previously-created over-cap content
      (>2 spaces / >6 zones / >50 items) is **visible but read-only**, photos/sync
      re-gated. Resubscribe → Pro restored over the same data.
- [ ] **Safe-fail (FR-2) & no-regression (FR-14).** Run with
      `ASPNETCORE_ENVIRONMENT=Production` and Stripe **not** configured → an upgrade
      attempt returns a clear "billing unavailable" (503) and the account stays Free (no
      crash, no free Pro). With billing configured, a Free user hitting a cap still gets
      the paywall with the matching `reason`; spaces/zones/items flows unchanged.
- [ ] **Legal hooks (FR-10/11/12).** Set `StripeSettings__TaxEnabled=true`,
      `__ConsentRequired=true` (+ `VITE_CHECKOUT_CONSENT=true`), `__InvoicingEnabled=true`
      → Checkout computes destination tax; the in-app consent step blocks "Subscribe &
      pay" until consent is checked; a Stripe test invoice/receipt is produced. Flip them
      off → the purchase flow still completes (hooks are optional/gated).

When all five pass, check the matching boxes in `tech-tasks.md` and move `task.md` to
`done`. **Going LIVE is a separate gate** — see [`./go-live-cutover.md`](./go-live-cutover.md).
