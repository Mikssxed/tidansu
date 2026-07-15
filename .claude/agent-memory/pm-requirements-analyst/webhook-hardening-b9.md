---
name: webhook-hardening-b9
description: LIGHT-path defence-in-depth / small-follow-up scoping pattern for existing endpoints (B-9 guard-add, B-10 event-handler-add); proposed B-9 thresholds; per-IP-vs-endpoint-wide rate-limit question for anonymous non-human callers
metadata:
  type: project
---

B-9 (harden `POST /api/billing/webhook`: rate limit + body-size cap) and B-10
(handle `checkout.session.async_payment_succeeded`/`_failed` by reusing the
existing grant logic) are both examples of a **LIGHT-path** backlog item,
alongside the audit-type pattern in [[security-scalability-audit-b8]]: a small,
targeted addition to an *existing* endpoint/handler — whether a defence-in-depth
guard (B-9) or a couple of new event-type handlers that reuse established logic
(B-10) — with no change to the core contract, gets a short, focused requirements
note (3-4 FRs with acceptance criteria) rather than the full multi-phase FR
document — no schema, no Kiota regen, no new capability/paywall reason.

**Why:** confirmed while scoping B-9 (2026-07-14) and B-10 (2026-07-14) per
explicit orchestrator instruction; matches how B-8 was already scoped down from
the default heavy template.
**How to apply:** when a backlog item is framed as "add a guard to an endpoint
that already exists" (B-9-style) OR "handle N more event types/branches by
reusing the existing handler's account-resolution/idempotency/grant logic"
(B-10-style), default to the short-note format: 3-4 FRs (the new behaviour(s),
an explicit non-regression FR protecting the existing path, and an observability
FR if the new path is dormant/rarely exercised), concrete proposed defaults
where numeric thresholds are involved, and open questions for anything only a
human/tech-lead should decide (e.g. whether a no-op branch still claims the
idempotency ledger).

**Proposed B-9 defaults** (pending product-owner confirmation): body cap **512 KB**,
rate limit **60 requests/minute** for the webhook endpoint.

**Recurring open question for anonymous, non-human-caller endpoints** (webhooks,
etc.): the codebase's existing rate limiters (auth endpoints) key off
`RemoteIpAddress`, which fits a human retrying an action. A webhook caller
(Stripe) isn't one identity — it calls from a range of infrastructure IPs — so
IP-keying either does nothing useful or unfairly buckets unrelated legitimate
deliveries together. Recommended default: an endpoint-wide/shared-budget limit
rather than per-IP, for any future anonymous machine-to-machine endpoint, not just
Stripe. This is sharper still because [[production-readiness-sweep]] already
flagged that `ForwardedHeadersOptions.KnownProxies`/`KnownNetworks` isn't
configured for a real reverse proxy in prod yet — so IP-keyed limits behind a
proxy may already be unreliable (everyone sharing one bucket) until that's fixed.
