# B-4 · Operator setup — real login email with Brevo (production)

This is the step-by-step the product owner must complete to make the production
magic-link sign-in email genuinely deliver. The backend is already wired for
SMTP; **all that is missing is the provider account and the production
environment variables** — no code change is needed once you have them.

Provider: **Brevo** (ex-Sendinblue) — EU-hosted (Paris), GDPR-native, SMTP relay,
free tier ~300 emails/day. Chosen for least code (drops into the existing SMTP
seam) and an easy EU start for the Poland launch.

---

## 1. Create a Brevo account and generate an SMTP key

1. Sign up at <https://www.brevo.com/> and verify your account.
2. In the dashboard open **SMTP & API** → **SMTP** tab
   (direct: <https://app.brevo.com/settings/keys/smtp>).
3. Note the SMTP server details Brevo shows:
   - **Server (host):** `smtp-relay.brevo.com`
   - **Port:** `587` (STARTTLS)
   - **Login:** your Brevo account **login email**.
4. Click **Generate a new SMTP key** and copy the key **once** — this is the
   value you use as the SMTP *password*. It is **not** your account password.
   Store it in your secret manager; treat it like any other production secret.

> The SMTP key is a bearer credential. Never commit it, never paste it into
> `appsettings*.json`, and never log it. The app reads it only from the
> environment.

---

## 2. Set the production environment variables

Set these on the production host / container (systemd `Environment=`, the
platform's secrets UI, `docker run -e`, etc.). ASP.NET Core maps the double
underscore `__` to the `SmtpSettings:` config section, so these override the
(empty) defaults in `appsettings.json`.

| Environment variable          | Example / value                       | Secret? |
| ----------------------------- | ------------------------------------- | ------- |
| `SmtpSettings__Host`          | `smtp-relay.brevo.com`                | no      |
| `SmtpSettings__Port`          | `587`                                 | no      |
| `SmtpSettings__EnableSsl`     | `true`                                | no      |
| `SmtpSettings__Username`      | `<brevo-login-email>`                 | no      |
| `SmtpSettings__Password`      | `<brevo-smtp-key>`                    | **YES** |
| `SmtpSettings__SenderEmail`   | `<from-address, e.g. noreply@tidansu.com>` | no |
| `SmtpSettings__SenderName`    | `Tidansu`                             | no      |

Also required in production (already part of the deploy, listed here for
completeness): `JwtSettings__Secret`, `ConnectionStrings__TidansuDb`, and
`AppSettings__FrontendUrl` (the public SPA base URL that the magic link is built
against — the link is `<FrontendUrl>/login?token=...`).

**Fail-loud guarantee:** if `Host`, `Username`, or `Password` is empty, or
`Port`/`EnableSsl` is unparseable, the app **refuses to start** with a message
naming the missing key (e.g. `SmtpSettings:Username is missing. Set the
SmtpSettings__Username environment variable.`). The value itself is never echoed.
It will **not** silently fall back to the dev file writer.

---

## 3. Sending identity — verified single sender now, authenticated domain later

You do not have an authenticated sending domain yet (that is **B-7**). To send
real email for testing today:

1. In Brevo, go to **Senders, Domains & Dedicated IPs** → **Senders** and add a
   **verified single sender** (e.g. your own mailbox). Brevo emails a
   confirmation link; click it.
2. Use that verified address as `SmtpSettings__SenderEmail`.

This is fine for testing and low volume, but a single verified sender has weaker
deliverability (more likely to land in spam). **A real sending domain with
SPF + DKIM (and later DMARC) is a B-7 prerequisite** for production-grade inbox
placement. When the domain is authenticated in Brevo, only
`SmtpSettings__SenderEmail` changes — no code change.

---

## 4. Verify a real send (owner action — needs live Brevo credentials)

This is the one check that could not be automated during implementation because
it needs the owner's Brevo account.

1. From `src/Tidansu.API`, run with the production profile and the env vars above,
   pointing at a real (test) database and a reachable Brevo account:
   ```bash
   ASPNETCORE_ENVIRONMENT=Production \
   SmtpSettings__Host=smtp-relay.brevo.com \
   SmtpSettings__Port=587 \
   SmtpSettings__EnableSsl=true \
   SmtpSettings__Username=<brevo-login-email> \
   SmtpSettings__Password=<brevo-smtp-key> \
   SmtpSettings__SenderEmail=<verified-sender> \
   SmtpSettings__SenderName=Tidansu \
   JwtSettings__Secret=<32+ char secret> \
   AppSettings__FrontendUrl=<public SPA url> \
   ConnectionStrings__TidansuDb=<connection string> \
   dotnet run --no-launch-profile
   ```
2. Confirm the app **starts** (no fail-loud) — meaning all SMTP config is present.
3. POST a real address you control:
   ```bash
   curl -s -X POST http://localhost:5081/api/auth/magic-link \
     -H "Content-Type: application/json" \
     -d '{"email":"you@yourdomain.com"}'
   ```
   The response body must be `{"data":{"devLink":null},...}` — **no `devLink`,
   no token** in production (the raw link is dev-only).
4. Check the inbox: the "Your Tidansu sign-in link" email should arrive. Click
   the button/link and confirm it signs you in (single-use, 15-minute expiry).
5. If nothing arrives: check Brevo dashboard → **Transactional** → **Logs** for
   the send, and the app log for a `Failed to deliver email to <recipient>` line
   (the app returns HTTP 500 on a delivery failure — never a silent success).

---

## 5. Deploy behind a proxy — lock down forwarded headers (B-7)

The magic-link endpoint is rate-limited **per client IP**. To make that work behind a
reverse proxy / load balancer, the app calls `UseForwardedHeaders` (reading
`X-Forwarded-For` / `X-Forwarded-Proto`) so it partitions on the real client IP instead
of the proxy's address.

For safety it currently trusts forwarded headers **only from a loopback proxy** (the
framework default `KnownProxies`/`KnownNetworks`), so a random internet client cannot spoof
`X-Forwarded-For` to dodge the rate limit. **This is not yet production-complete:**

- If your proxy is **not** on loopback (a separate load balancer, ingress, or PaaS edge),
  the forwarded IP will be **ignored** and every user will share a single rate-limit
  bucket (an accidental self-DoS on sign-ins).
- **B-7 deploy task:** add the real proxy's address(es) / network(s) to
  `ForwardedHeadersOptions.KnownProxies` / `KnownNetworks` (configured in `Program.cs`),
  scoped to the actual infrastructure — never a wildcard, which would let clients spoof
  their IP and bypass the limiter.

No credential is involved here; this is a network-trust configuration to complete when the
production proxy topology is known.

## What is verified vs. pending

- **Verified in implementation (no Brevo account needed):** dev file-write path
  unchanged (writes `DevelopmentEmails/*.html`, no SMTP, returns `devLink`);
  production fail-loud at startup on empty SMTP config (names the key, no secret,
  no dev file written); production runtime send failure returns a handled 500 with
  the recipient logged but **no link/token/secret**, and the process stays up.
- **Pending owner action (needs live credentials):** the real "email actually
  arrives and signs in" send — steps 1–4 above.
