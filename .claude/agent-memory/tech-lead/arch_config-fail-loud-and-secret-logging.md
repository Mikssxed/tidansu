---
name: arch-config-fail-loud-and-secret-logging
description: How Tidansu prod config validation and secret/credential logging must be planned (fail-loud startup guards; bearer creds never in logs)
metadata:
  type: project
---

Prod-sensitive config in Tidansu must fail loud at startup, and bearer credentials
must never reach logs. Plan tasks against these two established patterns.

**Why:** Auth-adjacent work (JWT, magic-link email) ships the same build to every
environment with only config changing. A silently-misconfigured prod (empty SMTP
creds, missing JWT secret) locks users out or masquerades as success — worse than
crashing. Magic links and provider passwords are bearer secrets; one log line leaks
account-takeover material.

**How to apply:**
- New prod-required config → add a startup guard modeled on the existing
  `JwtSettings:Secret` guard in `WebApplicationBuilderExtensions.AddPresentation`
  (throw `InvalidOperationException` naming the missing key, never echoing the value).
  Composition root is the seam for this — not handlers.
- Never plan a silent fallback to a dev/file path on prod misconfig — fail loud.
- Delivery/provider failures → throw a sanitized domain exception (recipient only),
  map it in `ErrorHandlingMiddleware` to a generic 5xx; never log the email body,
  magic link, token, or credential. Related: [[email-magic-link-delivery-seam]].
</content>
