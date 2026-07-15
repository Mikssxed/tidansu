### 📋 Backlog Item
Add defence-in-depth hardening — a per-endpoint rate limit and a maximum request-body
size — to the anonymous Stripe webhook receiver, without changing signature
verification or billing logic.

### 🎯 Product Context Summary
`POST /api/billing/webhook` is the only path that grants Pro, and it must stay
`[AllowAnonymous]` because Stripe calls it without a user session — signature
verification is its sole trust gate today. This is a **LIGHT-path** hardening item
(follow-up from the B-6 security review, scoped further during the B-8 audit): it adds
two generic protective guards around that one endpoint so a flood or oversized-payload
attack can't tie up app resources, while real Stripe traffic (small, infrequent JSON
events) sails through unaffected. No new functional capability, no schema change, no
plan/paywall interaction — this note stays short by design.

### 🔑 Core Functional Areas
- Request body size cap on the webhook endpoint
- Per-endpoint rate limit on the webhook endpoint
- Non-regression of legitimate Stripe webhook delivery

---

### Functional Requirements

**Body size cap**
- **FR-1**: The webhook endpoint must reject any request whose body exceeds a fixed
  size threshold, before the body is read into memory.
  - *Business rationale*: An anonymous endpoint that reads an unbounded body into
    memory is an easy resource-exhaustion target; Stripe's real payloads are small, so
    a tight endpoint-specific cap costs legitimate traffic nothing.
  - *Priority*: Phase 1 (Core) — this is the whole task.
  - *Plan & gate*: Not plan-gated; applies uniformly regardless of who eventually owns
    the resulting subscription.
  - *Constraints/Rules*: The cap must sit well under the app's existing global request
    size ceiling (~28.6 MB) — this is a *tight, endpoint-specific* limit, not a
    replacement for the global one. Rejection must happen before the payload is
    buffered/read, not after.
  - *Acceptance criteria*: A request to `/api/billing/webhook` with a body larger than
    the threshold is rejected with a 4xx response and the handler/command is never
    invoked. A request at or under the threshold is processed normally.

**Rate limit**
- **FR-2**: The webhook endpoint must reject excess requests beyond a fixed rate,
  independent of the rate limits already applied to auth endpoints.
  - *Business rationale*: Caps the damage of a junk-payload flood (deliberate or
    accidental) tying up app threads/CPU on a publicly reachable, unauthenticated URL.
  - *Priority*: Phase 1 (Core) — this is the whole task.
  - *Plan & gate*: Not plan-gated.
  - *Constraints/Rules*: The limit must accommodate legitimate Stripe traffic patterns,
    including bursts (e.g. many subscriptions renewing around the same time, or Stripe
    retrying a previously-failed delivery) without false-rejecting real events.
  - *Acceptance criteria*: Requests beyond the configured rate receive a 429 response.
    Requests within the configured rate are processed normally. A burst at or under the
    limit succeeds in full.

**Non-regression**
- **FR-3**: Existing webhook behaviour — Stripe signature verification, event
  handling, and the Pro-grant flow — must be unaffected by these two guards.
  - *Business rationale*: This task is additive hardening; it must not become a
    reliability risk for the one flow that actually charges and grants Pro.
  - *Priority*: Phase 1 (Core).
  - *Plan & gate*: Not plan-gated.
  - *Constraints/Rules*: Guards must reject *before* signature verification runs (fail
    cheap, before doing any billing work), never *instead of* or *after* it in a way
    that changes trust decisions.
  - *Acceptance criteria*: A normal-size, normal-cadence, correctly-signed Stripe test
    event still results in the same Pro-grant outcome as before this change. Rejections
    from the new guards produce no partial/duplicate billing side effects.

---

### ⚠️ Key Business Considerations
- **Don't break the money path.** These are defensive guards on the single endpoint
  that grants Pro; an overly tight threshold that starts rejecting real Stripe events
  is worse than the risk being defended against. Bias thresholds toward "generous
  enough for legitimate traffic" over "as tight as theoretically possible."
- **Stripe's calling identity isn't a normal user/session** — it's Stripe's
  infrastructure, not a single caller. A rate limit designed the same way as the
  per-user/per-IP auth limiters may not fit; see open question below.
- **No product-facing behaviour changes.** Nothing here is visible to end users; it's
  entirely operational hardening.

### 🚫 Out of Scope (Phase 1)
- Any change to Stripe signature verification, idempotency handling, or the
  checkout→Pro-grant mapping logic.
- Stripe IP allow-listing or any other network-layer control.
- Rate-limiting or size-capping any other endpoint (auth endpoints already have their
  own limits; not touched here).
- Handling delayed/async payment methods ([[B-10]]) or dependency advisories
  ([[B-11]]) — separate follow-ups from the same B-6 review.

### ❓ Open Questions for Product Owner
1. **Body size threshold** — proposing **512 KB** as the cap. Real Stripe event
   payloads (including nested/expanded objects) are typically a few KB up to roughly
   tens of KB; 512 KB leaves generous headroom for large/expanded events while staying
   far below the app's global ~28.6 MB default. Confirm or adjust.
2. **Rate limit threshold** — proposing **60 requests per minute** for the endpoint.
   This comfortably covers bursts (e.g. a bulk renewal moment or Stripe retrying
   several recently-failed deliveries) while still bounding a flood. Confirm or adjust.
3. **Who the rate limit applies against** — the existing auth-endpoint limiters key
   off the caller's IP address, which fits a human hitting "resend code" too often.
   Stripe's webhook calls come from Stripe's infrastructure (a range of IPs, not one
   caller), so an IP-keyed limit either does nothing useful (if Stripe rotates IPs
   across the window) or could under-count/over-count real traffic. Should this instead
   be a limit on the endpoint as a whole (all callers share one budget), or is
   IP-keying acceptable? Recommend endpoint-wide, but confirming since it changes what
   "excess" means.
4. **On rejection, does Stripe get a response it will retry sensibly on** — a 429/4xx
   from this endpoint should look like a transient failure to Stripe (which retries
   failed webhook deliveries automatically), not a permanent rejection. Confirming this
   matches expectations rather than needing a different status code.
