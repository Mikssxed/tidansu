---
name: recurring-gaps
description: Recurring / known-open Tidansu security gaps to check first on each review
metadata:
  type: project
---

Known-open gaps — check status each review rather than re-discovering:

- **Auth rate limit tightening — PARTLY LANDED (as of B-7, 2026-07-13).** A dedicated `magic-link` policy (3/min per IP, `WebApplicationBuilderExtensions.cs`) now sits alongside the shared `auth` policy (10/min), and a per-recipient `MagicLinkThrottle` (in-memory, `ServiceCollectionExtensions.cs`) exists to cap sends per address. The residual is deploy-time: the per-IP partition is only meaningful once the trusted proxy is configured (see next bullet). **How to apply:** the Phase-2 per-recipient throttle has landed — verify it's actually applied on the magic-link handler before re-flagging the mailbomb vector as open.

- **`UseForwardedHeaders` — NOW WIRED, config-driven (B-7, `Program.cs:44-69`).** `ForwardedHeaders:KnownProxies`/`KnownNetworks` bind from config; only explicit entries are added (no `.Clear()`), blank→loopback-only default, `"*"`/`0.0.0.0/0` rejected. **Two residual gaps** found in B-7 review: (1) wildcard rejection misses IPv6 `::/0` and split full-coverage ranges — an operator trusting `::/0` re-opens XFF spoofing (fix: reject `PrefixLength==0`); (2) the actual trusted proxy address is an **open deploy step** — until set, all users share one bucket. **How to apply:** on any rate-limit/proxy change, confirm the real proxy address is configured AND check the wildcard guard covers IPv6.

- **Fail-loud guards scoped to `IsProduction()` only (RECURRING — re-confirmed B-7).** JWT-secret, and now (B-7) `AppSettings:FrontendUrl` and `ConnectionStrings:TidansuDb` guards fire only when env == exactly `"Production"`. The SMTP guard fires for all non-Development envs — inconsistent. A mis-named internet-facing env (`Staging`, typo) boots half-broken past these guards. Mitigating: `ASPNETCORE_ENVIRONMENT` unset defaults to Production (bare deploy is safe), and dev shortcuts stay `IsDevelopment()`-gated so no auth bypass opens. Recommend `!IsDevelopment()` scoping. **How to apply:** on any new fail-loud guard, check it uses `!IsDevelopment()` (or an env allowlist), not `IsProduction()`, so Staging isn't a hole.

- **Fail-loud config guards miss the security-critical key.** B-6's Stripe `IsConfigured`/startup guard checked `SecretKey`+`ProPriceId` but omitted `WebhookSecret` — the one bearer credential gating the anonymous webhook (empty secret = forgeable = free Pro). Pattern: when reviewing any `IsConfigured`/fail-loud guard, enumerate *every* secret the feature depends on and confirm each is in the guard, not just the "obvious" ones.
  **How to apply:** on any new config guard or billing/auth secret, check the signing/verification secret is required, not just the API key.

- **Webhook/event handlers claim idempotency and mutate in separate `SaveChanges`.** Atomic dedupe insert is correct, but a mutation failure after the claim commits strands the operation (Stripe won't retry). Check claim+mutate share one unit of work whenever reviewing at-least-once event handlers.
