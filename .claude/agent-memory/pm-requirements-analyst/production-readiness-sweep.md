---
name: production-readiness-sweep
description: B-7 prod-readiness sweep — fail-loud/fail-safe config convention, B-7 vs B-8 scope split, and the concrete gaps found
metadata:
  type: project
---

Tidansu's established product convention for production config: **fail loud, fail
safe, never fail open**. On boot, missing/invalid required production config
(signing secret, SMTP, Stripe when enabled) must refuse to start with a message
naming the missing setting (never echoing the value) — never a silent fallback
to a dev-equivalent or permissive behaviour. Any future requirement touching
prod config should hold new settings to this same bar.

**Why:** Confirmed during B-7 (production-readiness sweep) requirements pass —
the pattern already exists for JWT secret/SMTP/Stripe but was inconsistently
applied to two other required settings.
**How to apply:** When writing requirements that add or touch prod-required
config, require the same fail-loud pattern rather than assuming "environment-
driven" alone is sufficient.

**Gaps identified in B-7 requirements pass (2026-07-13), not yet closed:**
- `AppSettings:FrontendUrl` and the `TidansuDb` connection string do **not** yet
  have the fail-loud startup guard that JWT/SMTP/Stripe already have.
- The auth rate limiter's `ForwardedHeadersOptions.KnownProxies`/`KnownNetworks`
  is still framework-default (loopback-only) — a real reverse proxy in front of
  production must have its address(es) explicitly trusted at deploy time, or
  every user shares one rate-limit bucket. This was already flagged in the B-4
  setup doc as "a B-7 deploy task," not optional cleanup.
- Confirmed **already safe** (no code change needed, just verification): the
  `VITE_DISABLE_AUTH` route-guard bypass is `import.meta.env.DEV`-gated (dead-
  code-eliminated from `vite build`); the dev email-to-file path and the
  returned magic-link (`devLink`) are both gated on `IsDevelopment()`.

**B-7 vs B-8 scope split** (recurring framing across the backlog pipeline):
B-7 owns end-to-end verification + trivial prod-config/leak fixes only. Deep
authorization/IDOR review, plan-limit-bypass audit, N+1/index/scalability
findings are explicitly B-8's job — B-7 should name and hand off anything that
looks like a genuine security/scale finding rather than absorbing it. See
[[billing-stripe]] for the related B-6 build-vs-go-live gate, which this sweep
must not re-litigate (test-mode only, no live charge in B-7).
