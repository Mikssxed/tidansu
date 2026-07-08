# Tidansu — Security Review
**Date:** 2026-07-08
**Scope:** B-4 "Real login email for production" — uncommitted working-tree changes
(`git diff HEAD` + new untracked `EmailDeliveryException.cs`). Files audited:
`EmailService.cs`, `ServiceCollectionExtensions.cs`, `ErrorHandlingMiddleware.cs`,
`EmailDeliveryException.cs`, plus the surrounding magic-link flow
(`MagicLinkEmailSender.cs`, `RequestMagicLinkCommandHandler`,
`ConsumeMagicLinkCommandHandler`, `AuthController`, `WebApplicationBuilderExtensions`,
`Program.cs`, `appsettings*.json`, `LoginView.vue`, `useAuth.ts`, `returnUrl.ts`).
**Type:** Findings report only — no code changes made.

**Overall:** The B-4 delivery change is well built and there is nothing exploitable
in the credential (magic-link) data path introduced by it. The prod send now fails
loud (runtime throw → handled 500; startup guard on missing SMTP config), no secret
or magic link reaches logs / exception messages / the HTTP response, the dev-only raw
link stays `null` in production, and no live secret is committed. The one materially
elevated risk is not a *new* bug but a *newly meaningful* one: making the endpoint send
real, quota-metered email turns the pre-existing loose rate limit into a genuine
mailbomb / provider-quota-exhaustion vector — correctly identified in the plan and
deferred to Phase 2, flagged High below so the merge gate is aware.

## What's already done right
- **Fail-closed at runtime.** `EmailService.SendEmailAsync` (prod branch,
  `EmailService.cs:38-64`) wraps `SendAsync()` in try/catch, re-throws
  `EmailDeliveryException(to)` on a raw provider exception, and throws again when
  `!response.Successful`. No silent 200; the handler does not swallow it.
- **Fail-closed at startup.** `ServiceCollectionExtensions.cs:59-87` validates
  `Host/Username/Password` non-empty and `Port/EnableSsl` parseable in the non-Dev
  branch, throwing `InvalidOperationException` before the app can boot. The guard runs
  for *all* non-Development environments (stricter than the JWT guard, which is
  Production-only).
- **No secret / bearer-credential leakage.** Every log statement on the delivery path
  (`EmailService.cs:17,49,58,63`) logs the **recipient only** — never `htmlBody`,
  `emailBuilder.Data.Body`, the token, or the link. `EmailDeliveryException`
  (`EmailDeliveryException.cs:5-6`) carries only the recipient. The startup guard and
  `RequireSmtpSetting` (`ServiceCollectionExtensions.cs:112-122`) name the missing
  **key**, never echo the value. Grep of all auth-path logging confirms zero token/link/
  body/secret sinks.
- **No dev-link leak to prod.** `MagicLinkEmailSender.SendAsync` returns `link` only when
  `IsDevelopment()`, else `null` (`MagicLinkEmailSender.cs:24`); `RequestMagicLinkResult.DevLink`
  is `null` in prod; `LoginView.vue:104` gates the button on `v-if="devLink"`. Unchanged
  by B-4 and not weakened.
- **No secrets in committed config.** `appsettings.json:12-20` ships empty
  `SmtpSettings:Host/Username/Password`; `SenderEmail/SenderName` are non-secret
  placeholders. Credentials arrive only via `SmtpSettings__*` env vars.
- **500 body is generic.** `ErrorHandlingMiddleware.cs:100-120` returns
  `"Something went wrong."` with no provider internals, no stack, no recipient in the
  client response; the recipient-only `ex.Message` is logged server-side.
- **Link security preserved.** Token hashed at rest (`HashRefreshToken`), single-use
  burned *before* JWTs are issued (`ConsumeMagicLinkCommandHandler.cs:27-29`), 15-min
  lifetime, prior links superseded (`RequestMagicLinkCommandHandler.cs:24`). Delivery
  change does not touch the token.
- **No request-body/query logging.** No `UseSerilogRequestLogging` in `Program.cs`, and
  `Microsoft.AspNetCore` is set to `Warning`, so the token carried in `/login?token=` and
  in the `POST /consume` body is never captured by request logs.
- **Token/returnUrl escaped into the email.** `rawToken` and `returnUrl` are
  `Uri.EscapeDataString`'d (`MagicLinkEmailSender.cs:16,19`) before insertion into the
  HTML `href`/`<span>` — percent-encoding neutralizes HTML/attribute injection.
- **Transport/headers/CORS** unchanged and intact: HSTS + HTTPS redirect in prod,
  nosniff / X-Frame-Options: DENY / Referrer-Policy, CORS restricted to the configured
  `FrontendUrl` origin (never `*`).

## Security findings

### High
**S-H1 — Real-email send makes the loose auth rate limit a mailbomb / quota-exhaustion vector**
`AuthController.cs:22` + `WebApplicationBuilderExtensions.cs:99-110`.
`POST /api/auth/magic-link` is throttled at 10 req/min per remote IP (fixed window).
Before B-4 the endpoint only wrote a local file, so abuse was inert. B-4 makes it send a
**real, quota-metered email through Brevo (free tier ~300/day)**, which changes the impact
of the same loose limit:
- **Victim mailbomb:** an attacker submitting a victim's address gets ~10 sign-in emails/min
  (~600/hr) delivered to that inbox from a single IP.
- **Global sign-in DoS via quota exhaustion:** ~30 minutes of sustained requests from one IP
  burns the entire 300/day Brevo quota, after which **no legitimate user can receive a
  sign-in link** until the quota resets — a full account-access outage at the product's front
  door.
The plan (`tech-tasks.md` §2, `requirements.md` FR-8) explicitly defers per-recipient
throttling and a tighter limit to Phase 2. That deferral is a **product decision, not a code
defect**, but it should be an explicit, accepted risk at the merge gate rather than an
oversight — the impact crosses from "annoying" to "denies sign-in to everyone" precisely
because B-4 wires real delivery. **Fix (Phase 2, as planned):** add a per-recipient
(per-email) throttle in addition to per-IP, tighten the per-IP window for this specific
endpoint (e.g. 3–5/min), and consider a longer cooldown after N requests for the same
address. Track under FR-8.

### Medium
**S-M1 — IP-based rate-limit partition is unreliable behind a reverse proxy (no forwarded-headers handling)**
`WebApplicationBuilderExtensions.cs:102-104`, `Program.cs`. The partition key is
`httpContext.Connection.RemoteIpAddress`. There is no `UseForwardedHeaders` /
`ForwardedHeadersOptions` in the pipeline. On a typical PaaS/container deployment behind a
load balancer or reverse proxy, `RemoteIpAddress` is the **proxy's** address, so either (a)
**every** user shares a single 10/min partition — 10 magic-link requests/min total across the
whole system, an accidental self-DoS on legitimate sign-ins — or (b) if a per-hop IP is seen,
the throttle is trivially defeated. This directly undercuts the only anti-abuse control in
front of S-H1. **Fix:** configure `ForwardedHeaders` (with a trusted-proxy allowlist so the
client IP can't be spoofed) so the limiter partitions on the real client IP; revisit together
with the S-H1 per-recipient throttle.

### Low / Hardening
**S-L1 — Failure logs include recipient email (PII) and raw provider error text**
`EmailService.cs:49,58`; `ErrorHandlingMiddleware.cs:105`. The delivery-failure logs record
the recipient address (personal data) and `ex.Message` / `response.ErrorMessages` verbatim.
Verified that neither field carries the link, token, or SMTP password (System.Net.Mail /
FluentEmail SMTP exceptions surface server SMTP responses, not credentials), so this is not a
secret-leak — but for a GDPR/EU launch the recipient address is PII sitting in the operator
log/file sink, and the provider error text is attacker-uninfluenced but unbounded. **Fix
(optional):** treat these logs as PII-bearing (retention/redaction policy), and keep asserting
in future provider swaps that provider error text never embeds message content. Note:
`ErrorHandlingMiddleware.cs:105` passes `ex.Message` as the Serilog *message template* (not a
`{param}`) — harmless for emails, but prefer `logger.LogError("{Message}", ex.Message)` to
avoid template-parsing surprises.

**S-L2 — `returnUrl` is baked into the emailed link without server-side validation (defense-in-depth)**
`MagicLinkEmailSender.cs:17-20`, `RequestMagicLinkCommand.cs:10` (pre-existing; not modified by
B-4). The attacker-controllable `ReturnUrl` from the request body is embedded in the emailed
link's query string with no server-side allowlisting. Exploitability is currently **blocked on
the consuming side**: `LoginView.vue` runs both the outgoing and the callback `returnUrl`
through `safeReturnUrl` (`returnUrl.ts`), which rejects absolute and protocol-relative URLs, so
a redirect can only ever land on a same-site relative path. It is also `Uri.EscapeDataString`'d,
so no HTML injection into the email. Left as hardening: validate/normalize `ReturnUrl`
server-side (same relative-path rule) so the invariant does not rely solely on the SPA, and cap
its length. Not a B-4 regression.

**S-L3 — Startup-guard environment scope differs from the JWT guard**
`ServiceCollectionExtensions.cs:53` (`!IsDevelopment()`) vs `WebApplicationBuilderExtensions.cs:26`
(`IsProduction()`). The SMTP guard is intentionally stricter (fires for Staging too), which is
the safe direction. Flagged only so the inconsistency is a deliberate, documented choice: a
`Staging` environment gets the SMTP fail-loud but **not** the JWT-secret fail-loud, so a Staging
box could boot with a weak/missing JWT secret. Consider aligning the JWT guard to
`!IsDevelopment()`. Outside B-4 scope.

## Verification checklist
- [ ] **S-H1 (mailbomb/quota):** from one IP, POST `/api/auth/magic-link` for a victim address
  in a loop; confirm >5/min real emails are accepted today, and after the Phase-2 fix confirm a
  per-recipient cap blocks the 4th–5th within the window and a burst can no longer drain the
  daily provider quota.
- [ ] **S-M1 (proxy IP):** deploy behind the real proxy, send magic-link requests from two
  distinct client IPs through the proxy, and confirm they land in **separate** rate-limit
  partitions (not one shared bucket) — i.e. `ForwardedHeaders` is resolving the client IP.
- [ ] **Fail-loud startup (regression):** boot `ASPNETCORE_ENVIRONMENT=Production` with empty
  `SmtpSettings__Host/Username/Password`; confirm the app aborts naming the key, prints no secret,
  and writes no `DevelopmentEmails/*.html`.
- [ ] **Fail-loud runtime (regression):** point at an unreachable SMTP host; confirm
  `POST /api/auth/magic-link` returns a handled 500 with `{"errors":{"general":["Something went
  wrong."]}}`, the log shows the recipient + `Failed to deliver email to …` with **0**
  occurrences of the token/link/secret, and the process stays up across repeated requests.
- [ ] **No dev-link in prod:** in a prod-like run confirm the response body is
  `{"data":{"devLink":null},...}` — no `devLink`, no token.
- [ ] **Owner real-send (SETUP.md §4):** confirm a real email arrives and the link signs in
  once within 15 minutes and is rejected on reuse/expiry.
