---
name: verify-prod-env-drives
description: How to drive the Tidansu API in a Production-like env for fail-loud/secret verification
metadata:
  type: feedback
---

Driving the Tidansu API under `ASPNETCORE_ENVIRONMENT=Production` for verification.

**Why:** Several backend tasks (e.g. B-4 email fail-loud) can only be verified in a
prod-like boot, but the dev conveniences aren't there.

**How to apply:**
- Swagger UI is Development-only. In Production, poll a real endpoint (e.g. POST
  `/api/auth/magic-link`) to detect readiness — `curl` on `/swagger/index.html`
  returns nothing/hangs and will time out.
- A Production boot needs env vars that `appsettings.json` leaves empty:
  `ConnectionStrings__TidansuDb`, `JwtSettings__Secret` (>=32 chars),
  `AppSettings__FrontendUrl`, and the `SmtpSettings__*` set. Missing any prod-guarded
  key makes the app fail loud at startup by design.
- To exercise an SMTP send failure fast, point `SmtpSettings__Host=127.0.0.1`,
  `SmtpSettings__Port=2525` (connection refused instantly) rather than a DNS-invalid
  host (slow timeout).
- Run each env config as its own `dotnet run --no-launch-profile` on a distinct
  `ASPNETCORE_URLS` port; `taskkill //F //IM dotnet.exe` between runs on Windows.
