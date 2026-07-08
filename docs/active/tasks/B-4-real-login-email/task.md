---
id: B-4
slug: real-login-email
title: Real login email for production
status: done         # code done + hardened + reviewed + committed 2026-07-08; ONLY the real-send verification remains, pending owner Brevo credentials (SETUP.md)
depends-on: []
touch-points:
  - src/Tidansu.Infrastructure/Services/EmailService.cs
  - src/Tidansu.Infrastructure/Services/MagicLinkEmailSender.cs
  - src/Tidansu.Infrastructure/Extensions/ServiceCollectionExtensions.cs
  - src/Tidansu.API/Program.cs
  - src/Tidansu.API/appsettings*.json
---

# B-4 · Real login email for production

## Description
Today the magic-link sign-in email is only written to a local HTML file in
development (`EmailService` in `IsDevelopment()`), and there is no working
provider in production, so real users on a deployed environment can't receive
their sign-in link. Wire a real transactional email provider so that in
production the magic-link email is genuinely delivered to the user's inbox, while
local development keeps writing the email to a file (no external calls in dev).
Success = on a prod-like environment, requesting a link sends a real email that
signs the user in.

## Acceptance criteria
- [ ] In production/prod-like config, requesting a sign-in link delivers a real email containing the working magic link.
- [ ] In development the behaviour is unchanged: the email is written to a local HTML file, no external call is made.
- [ ] Provider credentials/keys come from environment/secrets — never committed to source; no live keys in the repo/default config.
- [ ] Misconfiguration fails safely and is diagnosable (clear log/error), without leaking secrets, and does NOT silently fall back to the dev file or report success.
- [ ] The dev-only convenience of returning the raw magic link is NOT exposed in production (response carries no link/token).
- [ ] The link's existing security is preserved, not weakened: single-use, 15-minute expiry, new request supersedes prior active link.
- [ ] A delivery failure is logged for the operator without writing the magic link or any secret to the log, and does not crash the sign-in request.

## Notes
- Provider choice is **deferred to this task's requirements/tech-lead stage** (user's call: "decide during requirements"). GDPR/EU data residency is a plus for a Poland-based launch; the existing abstraction is FluentEmail (`IEmailService`), so an SMTP- or FluentEmail-sender-capable provider drops in with least code.
- This is a production-readiness foundation; it feeds into [[B-7]] (production-readiness sweep). It is auth-adjacent, so it will hit a **human gate** before implementation and likely warrant the security-reviewer at review time.
- Current dev behaviour already implemented: `EmailService.cs` writes to `DevelopmentEmails/*.html`; `MagicLinkEmailSender.cs` returns the raw link only in dev.
- A **production SMTP sender is already scaffolded** in `ServiceCollectionExtensions.cs` (reads `SmtpSettings:*`, credentials expected via env `SmtpSettings__Username/__Password`), but no real provider is configured/proven to deliver. The work is choosing a real provider and making that path genuinely deliver + fail safely — much of the seam exists.
- **Provider choice deferred to requirements/tech-lead + human gate.** See requirements Open Question 1: prefer an EU-hosted, SMTP-capable (FluentEmail-compatible) provider for a Poland/GDPR launch and least code; tech-lead to present 2–3 options for the owner to pick.
- Phasing: **Phase 1** = real delivery in prod + dev file preserved + secrets/fail-safe + no dev-link leak + preserve link security. Deferred: user-facing failure/resend UX and deliverability (Phase 2); retries/monitoring and branded templates (Phase 3).
- Plan-gating is **N/A** (authentication is not plan-gated — applies to all users on any plan).
- **Provider = Brevo** (EU SMTP, `smtp-relay.brevo.com:587` STARTTLS). Backend is
  provider-agnostic (existing `SmtpSettings:*` seam); no secret is committed —
  credentials arrive only via `SmtpSettings__*` env vars.
- **Operator guide:** [`./SETUP.md`](./SETUP.md) — exactly what the owner must
  provide/do (create Brevo account, generate SMTP key, set the prod env vars,
  verified-single-sender-now / authenticated-domain-later, real-send verification).
- **Security hardening (2026-07-08, post-review S-H1/S-M1):** the magic-link REQUEST
  endpoint now has a **dedicated per-IP limit of 3/min** (was on the shared 10/min `auth`
  policy); a **per-recipient throttle** (normalized email: 60s cooldown + max 5/hour,
  `IMemoryCache`-backed, checked in the handler before send) stops a distributed mailbomb of
  one victim / Brevo-quota drain and returns a generic 429 that never reveals account
  existence; and `UseForwardedHeaders` (X-Forwarded-For/Proto, loopback-only trusted) makes
  the per-IP limiter partition on the real client IP behind a proxy. **B-7 must lock the
  real proxy into `KnownProxies`/`KnownNetworks` at deploy** (see `SETUP.md` §5). All four
  paths (per-IP 429, per-recipient 429, dev file + devLink, fresh success) driven and
  verified in Development; 0 token/link/secret log leaks.
- **Pending owner action:** the real "email actually arrives and signs in" send
  (SETUP.md §4) could NOT be verified in implementation because it needs the owner's
  live Brevo credentials. Everything else was driven end-to-end: dev file-write path
  unchanged; prod fail-loud at startup on empty SMTP config (names the key, no secret,
  no dev file in prod); prod runtime send failure returns a handled 500 with recipient
  logged but no link/token/secret and no process crash.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
