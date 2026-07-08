---
name: email-delivery-failure-path
description: How the magic-link email failure/fail-loud path is wired across layers — the invariants to re-check on any future email change
metadata:
  type: project
---

The prod magic-link email path (B-4, implemented 2026-07-08) is fail-loud and
secret-safe across layers. When reviewing future changes touching email:

- `EmailService.SendEmailAsync` (Infrastructure) branches on
  `IWebHostEnvironment.IsDevelopment()`: dev writes `DevelopmentEmails/*.html`;
  prod calls FluentEmail `SendAsync()` and **throws `EmailDeliveryException(to)`**
  on `!response.Successful` or a raw provider exception.
- `EmailDeliveryException` (Domain) message carries **only the recipient** — never
  the body, magic link/token, or SMTP password.
- Startup guard in `ServiceCollectionExtensions.AddInfrastructure` (non-dev branch)
  aborts boot if `SmtpSettings:Host/Username/Password` empty or `Port`/`EnableSsl`
  unparseable — names the key, never the value.
- `ErrorHandlingMiddleware` maps `EmailDeliveryException` → generic 500 **before**
  the generic `catch (Exception)`.
- `MagicLinkEmailSender.SendAsync` returns the raw link only under
  `IsDevelopment()`, else `null` (FR-4, no dev-link in prod).

**Why:** these are the load-bearing security invariants (bearer-credential link
must not hit logs; misconfig must not masquerade as success; dev link must not
reach prod). A future email/provider change can silently break any of them.

**How to apply:** on any diff touching these files, re-verify: no body/link/token
logged, exception message stays recipient-only, prod never falls back to the dev
file writer, and `devLink` stays `null` in prod. Known deferred risk: the
`auth` rate-limit on `POST /api/auth/magic-link` is loose (10/min per IP) →
mailbombing is possible now that email really sends (Phase 2 / FR-8).
See also [[reviewed-tasks-b2-b3-b4]].
