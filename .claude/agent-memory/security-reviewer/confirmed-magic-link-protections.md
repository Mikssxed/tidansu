---
name: confirmed-magic-link-protections
description: Verified security controls on the Tidansu magic-link / email-delivery auth path — do not re-flag these as findings
metadata:
  type: project
---

Confirmed protections on the passwordless magic-link auth path (verified 2026-07-08, B-4 review). Do NOT re-flag these unless the code changes.

- **Token at rest:** magic-link + refresh tokens stored as `jwtService.HashRefreshToken(...)`, never plaintext. Single-use link burned (`ConsumedAt` set + saved) *before* JWTs are issued in `ConsumeMagicLinkCommandHandler`. 15-min lifetime; a new request supersedes prior active links (`InvalidateActiveForEmailAsync`).
- **No secret/link in logs:** every log on the delivery path logs the **recipient email only** — never `htmlBody`, the token, the link, or the SMTP password. `EmailDeliveryException(recipient)` message carries only the recipient. Startup guard names the missing config **key**, never echoes the value.
- **Dev-link never in prod:** `MagicLinkEmailSender.SendAsync` returns the raw link only under `IsDevelopment()`, else `null`; `RequestMagicLinkResult.DevLink` is null in prod; `LoginView.vue` gates the button on `v-if="devLink"`.
- **Fail-closed email:** prod send throws `EmailDeliveryException` on failure (runtime → handled 500 generic body) and a startup guard aborts boot on missing/invalid `SmtpSettings` (all non-Development envs). Never a silent 200, never a dev-file write in prod.
- **No committed SMTP secret:** `appsettings.json` ships empty `SmtpSettings:Host/Username/Password`; creds via `SmtpSettings__*` env only. Provider = Brevo (EU SMTP).
- **Open redirect handled:** `returnUrl` is re-validated on the SPA side by `safeReturnUrl` (`utils/returnUrl.ts`) — rejects absolute + protocol-relative (`//`, `/\`) URLs — on both request and consume. `returnUrl`/token are `Uri.EscapeDataString`'d into the email HTML (no injection).
- **No request/query logging:** no `UseSerilogRequestLogging`; `Microsoft.AspNetCore` log level is Warning, so the token in `/login?token=` and the consume POST body are not captured.

See [[recurring-gaps]] for the open rate-limit gap on this same surface.
