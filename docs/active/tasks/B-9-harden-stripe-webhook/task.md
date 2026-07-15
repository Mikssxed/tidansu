---
id: B-9
slug: harden-stripe-webhook
title: Harden the Stripe webhook endpoint (rate-limit + body cap)
status: in-review    # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: []
touch-points:
  - src/Tidansu.API/Program.cs
  - src/Tidansu.API/Controllers/BillingController.cs
---

# B-9 · Harden the Stripe webhook endpoint (rate-limit + body cap)

## Description
Follow-up from the B-6 security review. The Stripe webhook (`POST /api/billing/webhook`)
is necessarily `[AllowAnonymous]`, so Stripe signature verification is its only gate.
Add defence-in-depth so a flood of junk payloads can't tie up the app: a per-endpoint
**rate limit** and a maximum **request-body size** (reject oversized bodies before the
handler reads them). Low risk today, but cheap insurance on an internet-facing anonymous
endpoint.

## Acceptance criteria
- [x] Oversized request bodies to `/api/billing/webhook` are rejected before the payload
      is read into memory (returns 4xx, not a full read).
- [x] The webhook endpoint is rate-limited per-endpoint; excess requests get 429.
- [x] Legitimate Stripe webhooks (normal size, normal cadence) still succeed — no
      regression to signature verification or Pro-grant flow.
- [x] Body cap is sized to comfortably fit real Stripe event payloads.
- [x] Both guards reject *before* signature verification runs, and produce no partial
      or duplicate billing side effects when they fire.

## Notes
- **Tech-planning done → [`./tech-tasks.md`](./tech-tasks.md).** Three API-only edits,
  one dev run. Key non-obvious decision the developer MUST know: `[RequestSizeLimit]`
  makes Kestrel throw `BadHttpRequestException` (carrying `StatusCode = 413`) *inside*
  the action at `ReadToEndAsync` — that exception currently falls into
  `ErrorHandlingMiddleware`'s generic `catch (Exception)` and would surface as **500**,
  masking the guard. The plan adds a `catch (BadHttpRequestException)` clause that maps
  to `ex.StatusCode`; without it FR-1's "4xx" criterion fails. Rate limiter uses a
  **constant partition key** (`"billing-webhook"`) for the endpoint-wide budget — do
  not copy the auth limiters' per-IP `RemoteIpAddress` key. Status codes: 429 (rate)
  / 413 (size), both retried transiently by Stripe (resolves req Open Q4). No migration,
  no Kiota, no frontend.
- Full functional requirements: [`./requirements.md`](./requirements.md).
- Proposed defaults (confirm with product owner before/while implementing): body cap
  **512 KB**, rate limit **60 requests/minute**. Open question on whether the rate
  limit should be keyed per-caller IP (like the existing auth limiters) or applied as
  one shared budget for the whole endpoint, since Stripe's webhook calls don't come
  from a single caller identity — recommend endpoint-wide.
- **Pipeline path: LIGHT.** Defence-in-depth config/guards on an existing endpoint —
  no schema, no new contract/Kiota regen, no change to signature-verification or
  billing *logic*. Short requirements note; one developer run; single security-lensed
  reviewer at Stage 4.
- Current webhook: `BillingController.Webhook()` does
  `new StreamReader(Request.Body).ReadToEndAsync()` with no size bound, then delegates
  to `HandleStripeWebhookCommand`.
- Rate-limiter + `RequestSizeLimit`/`MaxRequestBodySize` wiring goes in `Program.cs`;
  per-action attributes may go on `BillingController`.
- Kestrel already has a global `MaxRequestBodySize` (~28.6 MB default) — B-9 wants a
  *tight* per-endpoint cap, not the global default.
- Related follow-ups from the same B-6 review: [[B-10]] (async payment methods),
  [[B-11]] (dependency advisories).

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
