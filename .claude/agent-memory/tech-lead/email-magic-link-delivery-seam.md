---
name: email-magic-link-delivery-seam
description: Tidansu's email/magic-link delivery seam — IEmailService + FluentEmail SMTP, dev-file vs prod-send, and what a delivery-only change does NOT need
metadata:
  type: project
---

Email delivery sits behind one deep interface, `IEmailService`
(`Tidansu.Domain/Interfaces`), implemented by `EmailService` (Infrastructure) which
branches on `IWebHostEnvironment.IsDevelopment()`: dev writes `DevelopmentEmails/*.html`
and makes no external call; prod calls FluentEmail `SendAsync()`. The prod SMTP sender
is wired in `ServiceCollectionExtensions.AddInfrastructure` from `SmtpSettings:*` (creds
via `SmtpSettings__Username/__Password` env). `FluentEmail.Smtp` is already referenced,
so any SMTP provider is config-only — no new package, no new seam.

**Why:** Knowing the seam already exists prevents over-planning provider integrations.
The magic-link raw link is returned to the SPA only in dev — `MagicLinkEmailSender.SendAsync`
returns `null` when not `IsDevelopment()`, and `LoginView.vue` guards `v-if="devLink"`.

**How to apply:**
- A change that only affects *delivery* (provider, send-failure handling, from-identity)
  touches Infrastructure + config only. The request/response DTO is unchanged, so plan
  **no Kiota regeneration and no frontend code change**.
- A pure-API email provider (no SMTP) would need an `ISender` adapter + package — prefer
  SMTP-capable providers to reuse the seam. Related: [[arch-config-fail-loud-and-secret-logging]].
</content>
