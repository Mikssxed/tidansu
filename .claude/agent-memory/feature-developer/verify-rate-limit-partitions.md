---
name: verify-rate-limit-partitions
description: How to drive/verify per-IP vs per-recipient throttles on the Tidansu auth endpoints from one machine
metadata:
  type: feedback
---

Verifying the two independent magic-link throttles (per-IP rate limiter + per-recipient
`IMemoryCache` throttle) from a single loopback client.

**Why:** all local curl comes from one IP, so the per-IP limiter would mask the
per-recipient throttle and you can't tell which control fired.

**How to apply:**
- After `UseForwardedHeaders` was added (B-4 hardening), the app trusts `X-Forwarded-For`
  **only from a loopback proxy** — and localhost curl *is* loopback, so the limiter
  partitions on whatever `X-Forwarded-For` header you send. Use this to vary the "client IP".
- Isolate the **per-IP** limit: same `X-Forwarded-For`, unique email per request → the
  Nth+1 request returns **429 with an empty body** (the RateLimiter middleware rejection).
- Isolate the **per-recipient** throttle: **vary** `X-Forwarded-For` each request, keep the
  **same email** → 429 with a **JSON body** `{"errors":{"general":["Too many requests..."]}}`
  from `ErrorHandlingMiddleware`. Different body = proves which control fired.
- A throttled magic-link request writes **no** `DevelopmentEmails/*.html` and never reaches
  the "Issuing magic link" log line — good signals that nothing was sent/mutated.
- See [[verify-prod-env-drives]] for the prod-like boot variant.
