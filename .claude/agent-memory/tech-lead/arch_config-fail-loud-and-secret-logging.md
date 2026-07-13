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
- **Forwarded-headers / rate-limiter proxy trust is a security seam, not just
  config.** `Program.cs` `UseForwardedHeaders` resolves the real client IP that the
  magic-link/auth rate limiter partitions on. `KnownProxies`/`KnownNetworks` must be
  **env-driven** (deploy-time value, topology-dependent) and the binding code must
  **only add** parsed entries — never `.Clear()`-then-trust-all, never accept a
  wildcard/`0.0.0.0/0`, and blank config must fall back to the framework
  loopback-only default (fail safe). A wildcard here lets any client spoof
  `X-Forwarded-For` and dodge the limiter entirely. Framework default (loopback
  only) means one shared bucket for all users behind a real proxy — so it's an
  explicit **open deploy step**, not "done", until the prod proxy address is known.
  The `// SECURITY (B-7)` comment in `Program.cs` marks this seam.
- **Fail-loud guards are Production-only.** They gate on
  `builder.Environment.IsProduction()` / `environment.IsProduction()` so the swagger
  CLI + Development still boot with a blank connection string / blank config (the
  Kiota-regen running-app fallback depends on this). As of B-7 the guarded prod-
  required keys are: `JwtSettings:Secret`, SMTP creds, Stripe-when-`Enabled`,
  `AppSettings:FrontendUrl` (builds magic-link + Checkout return URLs), and the
  `TidansuDb` connection string.
</content>
