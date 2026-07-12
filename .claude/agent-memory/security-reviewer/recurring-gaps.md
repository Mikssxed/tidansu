---
name: recurring-gaps
description: Recurring / known-open Tidansu security gaps to check first on each review
metadata:
  type: project
---

Known-open gaps — check status each review rather than re-discovering:

- **Auth rate limit is loose and IP-only.** `auth` policy = 10 req/min per `RemoteIpAddress` (`WebApplicationBuilderExtensions.cs`). No per-recipient throttle. Since B-4 wired real email, `POST /api/auth/magic-link` is now a mailbomb + provider-quota-exhaustion (Brevo ~300/day) vector — draining the daily quota is a global sign-in DoS. Tightening + per-recipient throttle is deferred to **Phase 2 (requirements FR-8)**. Flag as High but note the intended deferral.
  **Why:** delivery going real elevated a previously-inert loose limit. **How to apply:** on any change to the magic-link endpoint or rate-limit policy, re-check whether Phase 2 has landed.

- **No `UseForwardedHeaders` in `Program.cs`.** Behind a reverse proxy/LB, `RemoteIpAddress` is the proxy IP, so the per-IP rate limiter either collapses to one shared global bucket (accidental sign-in DoS) or is defeated. Fix needs a trusted-proxy allowlist to avoid IP spoofing.
  **How to apply:** flag whenever reviewing rate-limiting or a deployment/proxy change.

- **JWT-secret guard fires only for `IsProduction`**, while the SMTP guard fires for all non-Development envs. A `Staging` box can boot with a weak/missing JWT secret. Low; note if Staging becomes a real environment.

- **Fail-loud config guards miss the security-critical key.** B-6's Stripe `IsConfigured`/startup guard checked `SecretKey`+`ProPriceId` but omitted `WebhookSecret` — the one bearer credential gating the anonymous webhook (empty secret = forgeable = free Pro). Pattern: when reviewing any `IsConfigured`/fail-loud guard, enumerate *every* secret the feature depends on and confirm each is in the guard, not just the "obvious" ones.
  **How to apply:** on any new config guard or billing/auth secret, check the signing/verification secret is required, not just the API key.

- **Webhook/event handlers claim idempotency and mutate in separate `SaveChanges`.** Atomic dedupe insert is correct, but a mutation failure after the claim commits strands the operation (Stripe won't retry). Check claim+mutate share one unit of work whenever reviewing at-least-once event handlers.
