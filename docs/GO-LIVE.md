# Tidansu — Go‑Live Runbook (start here)

A single, linear, do‑this‑then‑that guide to putting Tidansu on the public
internet. Written to be followed top‑to‑bottom with **no prior DevOps
knowledge**. Every scary decision is called out with a plain‑English "what this
means" and a recommended default.

> 📋 **Interactive checklist:** this runbook is also a tick-off-as-you-go page
> with saved progress —
> <https://claude.ai/code/artifact/e26fa476-8d6e-4d77-b5f6-844483f01317>.
> Your ticks are stored in your own browser (private, per-device); this file
> stays the version-controlled source of truth. Keep the two in sync when steps
> change.

> **The one thing to understand first.** Tidansu goes live in **two milestones**,
> not one:
>
> 1. **Milestone A — App live, no paid billing.** Anyone can sign up, use the
>    free plan, map spaces/zones/items. "Upgrade to Pro" shows a clean *"billing
>    unavailable"* message. **You can do this now** — it needs only a host, a
>    database, and an email provider.
> 2. **Milestone B — Turn on paid Pro.** Real card charges. This is **blocked by
>    law**, not by code: selling subscriptions from Poland needs VAT/OSS
>    registration, invoicing, consumer‑law checkout copy, and legal pages, all
>    confirmed by an accountant/lawyer. See §7. **Do not skip this gate.**
>
> Ship Milestone A first. It is a real, usable, live product. Add Milestone B
> when the legal work is done.

The app is **one program**: the .NET API also serves the website. There is no
separate frontend server to deploy. Database schema updates apply **themselves**
the first time the new build starts. Most of "going live" is therefore just:
**pick a host, point the app at a database and an email provider, set a handful
of environment variables, and start it.**

---

## 0. What you need before you start (shopping list)

| # | Thing | Why | Notes |
|---|---|---|---|
| 1 | A **domain name** (e.g. `tidansu.com`) | The public address; magic‑link emails are built from it | Any registrar. Buy it first — several later steps need it. |
| 2 | A **host that runs .NET 10** | Runs the app | Recommended: **Azure App Service** (least steps for a .NET + SQL Server app, has EU regions). Alternatives: a Linux VM (Hetzner/DigitalOcean, EU region) with the .NET 10 runtime. |
| 3 | A **SQL Server database** the host can reach | Stores all data | Recommended: **Azure SQL Database** (managed, EU region). The app creates its own tables on first boot — you only create the empty database. |
| 4 | A **Brevo account** (free tier) | Sends the sign‑in emails | Full setup in [`active/tasks/B-4-real-login-email/SETUP.md`](active/tasks/B-4-real-login-email/SETUP.md). |
| 5 | A **secret manager** (your host's "environment variables" / "secrets" screen) | Holds passwords/keys safely | **Never** put secrets in the code or in `appsettings*.json`. |
| 6 | *(Milestone B only)* A **Stripe account** + an **accountant/lawyer** | Charging money legally | See §7. Not needed for Milestone A. |

> **Pick EU regions** for the host and the database (Poland launch, GDPR). Keep
> host and database in the **same region** so they're fast and cheap to talk to.

---

## Milestone A — Put the app live (no paid billing)

### 1. Build the shippable app

Run these from a checkout of the repo on your machine (or in CI).

```bash
# 1a. one-time per clone: restore the pinned build tools (kiota, etc.)
dotnet tool restore

# 1b. build the website into the API's wwwroot folder
cd src/Tidansu.App
npm ci
npm run build          # outputs to ../Tidansu.API/wwwroot

# 1c. publish the API (this now includes the website) for Linux
cd ../Tidansu.API
dotnet publish -c Release -o ./publish
```

The `./publish` folder is the entire deployable app: the API **and** the website
inside its `wwwroot`. That's what you upload to the host.

> **Do NOT set `VITE_DISABLE_AUTH` anywhere.** It only works in a dev build and
> is physically removed from the production build — verified, nothing to do
> except never turn it on.

### 2. Create the empty database

Create a blank **SQL Server** database (e.g. Azure SQL → "Create database",
EU region). Do **not** create any tables — the app builds its own schema on
first start (migrations run automatically). Copy its **connection string**;
you'll paste it into a secret in step 4.

### 3. Set up email (Brevo)

Follow [`active/tasks/B-4-real-login-email/SETUP.md`](active/tasks/B-4-real-login-email/SETUP.md)
**sections 1 and 3** to:

1. Create the Brevo account and **generate one SMTP key** (this is the email
   *password* — copy it once, store it as a secret).
2. Add a **verified sender address** (e.g. `noreply@tidansu.com`) so Brevo will
   send on your behalf.

You'll plug the Brevo values into the environment variables in step 4.

> **Deliverability tip (do soon, not blocking):** a single verified sender lands
> in spam more often. Authenticating your domain in Brevo (SPF + DKIM) fixes
> that and only changes `SmtpSettings__SenderEmail` — no code change. See B‑4
> SETUP §3.

### 4. Set the environment variables on the host

These are the app's entire configuration. Set them in your host's
**environment variables / secrets** screen. The `__` (double underscore) is
required — that's how .NET maps them to settings.

**Always required** (the app **refuses to start** and tells you which key is
missing if any of these is blank — a good thing, it can't silently half‑work):

| Variable | Value | Secret? |
|---|---|---|
| `ASPNETCORE_ENVIRONMENT` | `Production` | no |
| `JwtSettings__Secret` | a random string **≥ 32 characters** (generate one; never reuse an example) | **YES** |
| `ConnectionStrings__TidansuDb` | the connection string from step 2 | **YES** |
| `AppSettings__FrontendUrl` | your public site URL, e.g. `https://tidansu.com` | no |
| `SmtpSettings__Host` | `smtp-relay.brevo.com` | no |
| `SmtpSettings__Port` | `587` | no |
| `SmtpSettings__EnableSsl` | `true` | no |
| `SmtpSettings__Username` | your Brevo **login email** | no |
| `SmtpSettings__Password` | the Brevo **SMTP key** from step 3 | **YES** |
| `SmtpSettings__SenderEmail` | your verified sender, e.g. `noreply@tidansu.com` | no |
| `SmtpSettings__SenderName` | `Tidansu` | no |

**Required once the app runs behind a proxy / load balancer** (Azure App Service,
any ingress, any CDN — i.e. almost always in production):

| Variable | Value | Why |
|---|---|---|
| `ForwardedHeaders__KnownProxies__0` | your proxy's IP, e.g. `10.0.0.4` | Without it, the sign‑in rate‑limiter treats **all** visitors as one person and can lock everyone out together. |
| `ForwardedHeaders__KnownNetworks__0` | *or* a CIDR range, e.g. `10.0.0.0/16` | Use this instead if the proxy IP varies. |

> **Never** set these to `*` or `0.0.0.0/0` — the app rejects wildcards at
> startup on purpose (a wildcard would let anyone fake their IP and dodge the
> rate limit). If you don't know the proxy IP yet, launch without these, confirm
> everything works, then add the real value (see the full table in
> [`active/tasks/B-7-production-readiness-sweep/deploy-config.md`](active/tasks/B-7-production-readiness-sweep/deploy-config.md)).

**Do NOT set any `StripeSettings__*` for Milestone A.** Leaving Stripe unset makes
the app run in "billing unavailable" mode: the free plan works fully and
"Upgrade to Pro" returns a clean message instead of charging anyone. That's
exactly what we want until §7 is cleared.

### 5. Deploy and start

1. Upload/point the host at the `./publish` folder from step 1 (Azure App
   Service: "Deploy" from a zip or CI; a VM: copy the folder and run
   `dotnet Tidansu.API.dll`).
2. Put the app behind **HTTPS** with your domain — on a managed host this is a
   toggle ("custom domain" + "managed certificate"); on a VM use a reverse proxy
   (Caddy/Nginx) that terminates TLS. **The public URL must match
   `AppSettings__FrontendUrl` exactly.**
3. Start it. On first boot it **creates all database tables automatically**.

**If it won't start:** read the very first error line — it names the exact
missing/blank setting (e.g. `SmtpSettings:Username is missing.`). Fix that one
variable and restart. It never prints secret values, so the log is safe to
share.

### 6. Prove it works (the real drive)

Do these against the **live** URL, in order:

- [ ] Open `https://<your-domain>` → the landing page loads over HTTPS.
- [ ] Go to a protected page (e.g. `/spaces`) while signed out → it redirects to
      `/login` (auth is enforced).
- [ ] Request a sign‑in link with a real inbox you control → **the email
      arrives** (check spam), the button signs you in (link is single‑use,
      expires in 15 min).
- [ ] Create a space, a zone, an item → they save and are still there after a
      reload.
- [ ] As a free user, cross a limit (e.g. a 3rd space) → the **paywall** appears
      with the right reason; nothing is created past the cap.
- [ ] Click "Upgrade to Pro" → you get a clean **"billing unavailable"** message
      (expected in Milestone A — not an error).
- [ ] Item photos: there is **no "Add a photo" button** anywhere (the feature is
      intentionally hidden until it ships).

If all boxes pass, **Milestone A is live.** 🎉 People can sign up and use the
free product today.

---

## 7. Milestone B — Turn on paid Pro (the legal gate)

> ⛔ **Stop.** Do not set any live Stripe key or `StripeSettings__Enabled=true`
> until the checklist below is **professionally confirmed**. Charging real
> customers from Poland without it means missing VAT/OSS registration,
> compliant invoicing, consumer‑law checkout, and required legal pages.

This milestone is **mostly not a coding task** — the code is already built and
tested in Stripe *test mode*. What's left is legal/financial setup plus flipping
configuration. Work through these **in order**, with your accountant/lawyer:

1. **Clear the Poland compliance checklist.** Read
   [`legal/poland-payments-compliance.md`](legal/poland-payments-compliance.md)
   §10 (A–F prerequisites) and §11 (open questions for your accountant/lawyer):
   VAT/OSS registration, invoicing/KSeF plan, consumer‑law checkout, GDPR/DPA,
   and the required legal pages (Regulamin/ToS, privacy, withdrawal/refund,
   seller imprint). **All of it must be satisfied and confirmed first.**
2. **Verify Stripe in TEST mode first.** Nothing here charges real money — prove
   the whole flow works before going live. (Full detail:
   [`active/tasks/B-6-connect-real-stripe/SETUP.md`](active/tasks/B-6-connect-real-stripe/SETUP.md).)

   **One-time setup:**
   - [ ] Stripe Dashboard, **Test mode ON**: create a **Pro product + recurring
         price** → copy its `price_…` id.
   - [ ] Developers → API keys → copy the **test secret key** (`sk_test_…`).
   - [ ] Install the [Stripe CLI](https://stripe.com/docs/stripe-cli) and run
         `stripe login`.
   - [ ] Set local secrets from `src/Tidansu.API` (never commit them):
     ```bash
     dotnet user-secrets set "StripeSettings:Enabled" "true"
     dotnet user-secrets set "StripeSettings:SecretKey" "sk_test_…"
     dotnet user-secrets set "StripeSettings:ProPriceId" "price_…"
     # WebhookSecret is printed by `stripe listen` below — set it then:
     dotnet user-secrets set "StripeSettings:WebhookSecret" "whsec_…"
     ```

   **Run the stack (three terminals):**
   ```bash
   # 1 — API
   dotnet run --project src/Tidansu.API
   # 2 — forward Stripe events (prints whsec_… → set it, restart the API)
   stripe listen --forward-to localhost:5081/api/billing/webhook
   # 3 — frontend
   cd src/Tidansu.App && npm run dev
   ```

   **Verification checklist:**
   - [ ] **Happy path:** hit a cap → paywall → Checkout → pay with
         `4242 4242 4242 4242`. Account becomes **Pro via the
         `checkout.session.completed` webhook** (not a client flip); the customer
         & subscription ids are persisted on the user.
   - [ ] **Webhook trust:** a bad/missing `Stripe-Signature` → **400**, no plan
         change. Re-deliver the same event (`stripe events resend <id>`) → second
         delivery is a no-op (idempotency ledger), account stays correctly Pro.
   - [ ] **Cancel at period end:** downgrade from the app → still "Pro until
         <date>", not instantly Free. Force period end → returns to **Free**;
         over-cap content (>2 spaces / >6 zones / >50 items) becomes **read-only**;
         resubscribe restores Pro over the same data.
   - [ ] **Safe-fail:** run with `ASPNETCORE_ENVIRONMENT=Production` and Stripe
         **not** configured → an upgrade returns "billing unavailable" (503) and
         the account stays Free — no crash, no free Pro.
   - [ ] **Legal hooks:** with `StripeSettings__TaxEnabled=true`,
         `__ConsentRequired=true` (+ `VITE_CHECKOUT_CONSENT=true`),
         `__InvoicingEnabled=true` → Checkout computes destination tax, the
         in-app consent step blocks "Subscribe & pay" until checked, and a test
         invoice is produced. Flip them off → the purchase still completes.

3. **Do the live cutover** (configuration only — no code change). Full steps in
   [`active/tasks/B-6-connect-real-stripe/go-live-cutover.md`](active/tasks/B-6-connect-real-stripe/go-live-cutover.md).

   In the **Stripe Dashboard, Live mode:**
   - [ ] Create the **live Pro price** → note its `price_…`.
   - [ ] Register a **live webhook endpoint** →
         `https://<prod-host>/api/billing/webhook`, subscribed to
         `checkout.session.completed`, `customer.subscription.updated`,
         `customer.subscription.deleted`. Copy its signing secret (`whsec_…`).
   - [ ] Configure **Stripe Tax** (registrations per §4/§5) and the **invoice
         template** — only once the accountant confirms the details.

   Then in **App Service → Environment variables** (as secrets), and restart:

   | Variable | Value |
   |---|---|
   | `StripeSettings__Enabled` | `true` |
   | `StripeSettings__SecretKey` | `sk_live_…` |
   | `StripeSettings__WebhookSecret` | `whsec_…` (from the live endpoint) |
   | `StripeSettings__ProPriceId` | the live `price_…` |
   | `StripeSettings__SuccessUrl` | `https://<host>/account?upgraded=1` |
   | `StripeSettings__CancelUrl` | `https://<host>/pricing` |
   | `StripeSettings__TaxEnabled` / `__ConsentRequired` / `__InvoicingEnabled` | `true` once each one's copy/config is finalized (+ set `VITE_CHECKOUT_CONSENT=true` for the frontend build) |

   On restart, `Enabled && IsConfigured` selects the real Stripe service; a
   misconfiguration **fails loud naming the missing key** rather than running
   degraded.

4. **One careful real smoke test.** A real card = a real charge. Buy one
   subscription, confirm the webhook granted Pro and the invoice is compliant,
   confirm cancellation returns to Free at period end, then refund it.

**Rollback is instant and safe:** set `StripeSettings__Enabled=false` and
restart — upgrades go back to "billing unavailable", no one is charged, and
existing Pro accounts keep their plan.

---

## 8. After you're live (housekeeping)

- **Back up the database** on a schedule (managed SQL services do this — turn it
  on and confirm the retention window).
- **Watch the logs** for the first days — the app logs sign‑in issuance and email
  failures (a failed email send surfaces as a clear error, never a silent
  success).
- **Secrets rotation:** the Brevo SMTP key, `JwtSettings__Secret`, and (later)
  Stripe keys are the sensitive ones. Rotating `JwtSettings__Secret` signs
  everyone out (they just sign in again) — safe to do if you suspect a leak.
- **Deploying an update:** repeat §1 (build + publish) and redeploy. New database
  migrations apply themselves on the next start. No manual DB step.

---

## Where the detail lives (source docs this runbook stitches together)

| Topic | Authoritative doc |
|---|---|
| Every env var + what blank does | `active/tasks/B-7-production-readiness-sweep/deploy-config.md` |
| What was proven prod‑ready (and what's still owner‑pending) | `active/tasks/B-7-production-readiness-sweep/proof-checklist.md` |
| Email / Brevo setup | `active/tasks/B-4-real-login-email/SETUP.md` |
| Stripe test‑mode setup | `active/tasks/B-6-connect-real-stripe/SETUP.md` |
| Stripe live cutover | `active/tasks/B-6-connect-real-stripe/go-live-cutover.md` |
| Poland payments legal gate | `legal/poland-payments-compliance.md` |
