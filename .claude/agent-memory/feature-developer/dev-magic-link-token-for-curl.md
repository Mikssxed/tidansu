---
name: dev-magic-link-token-for-curl
description: Fastest way to get a bearer token for hand-crafted API verification in Development — no SMTP stub needed
metadata:
  type: feedback
---

To hand-craft authenticated requests against `dotnet run` (Development env) for
verification, skip the SMTP stub entirely — `MagicLinkEmailSender.SendAsync`
returns the raw link (`environment.IsDevelopment() ? link : null`) straight in
the API response, and `EmailService` writes the email to a file instead of
attempting real SMTP delivery in dev, so it never fails.

**Why:** the SMTP-stub workaround in [[verify-prod-auth-without-real-smtp]] exists
specifically because `ASPNETCORE_ENVIRONMENT=Production` suppresses the dev-link
shortcut and email really must succeed. In plain dev-mode verification there's no
need for that ceremony.

**How to apply:**
1. `POST /api/auth/magic-link {"email":"<any>@tidansu.local"}` → response body is
   `{"data":{"devLink":"http://localhost:5173/login?token=<urlencoded-token>"}}`.
2. URL-decode the `token` query param (e.g. `+` stays `+`, `%2B` → `+`) and
   `POST /api/auth/consume {"token":"<decoded-token>"}` — **not**
   `/consume-magic-link`, the route is just `/consume`. Response has
   `data.accessToken` — use as `Authorization: Bearer <token>`.
3. New users are auto-created on first consume, on the Free plan — handy for
   plan-cap verification without extra setup.
