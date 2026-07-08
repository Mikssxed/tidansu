# Backlog

The **pm-requirements-analyst** agent reads this file, picks the highest-priority
unprocessed item, and expands it into functional requirements in
`docs/active/requirements.md`.

Each item is a coarse product idea in **business language** — not a technical
task. Keep them small enough to be one feature slice. Mark an item `✅ done`
(don't delete) once it has shipped so history stays readable.

> The long-horizon build lives in [`docs/IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).
> This backlog is for **new feature work on top of the finished v1** — one idea
> per bullet, processed through the agent pipeline (see
> [`.claude/agents/README.md`](../.claude/agents/README.md)).

## Priority order (top = next)

<!-- Add items below. Format:
### [B-N] <one-line title>
**Priority**: P1 (next) | P2 | P3
**Status**: unprocessed | in-progress | ✅ done
<2–4 sentences of product intent in business language. What can the user do that
they couldn't before? Why does it matter? Any known limits/rules.>
-->

> **Ordering (2026-07-08 launch-readiness batch):** B-2 → B-3 (UI quick wins) →
> B-4 (real login email) → B-5 (Poland legal research — gate before payments) →
> B-6 (real Stripe) → B-7 (production-readiness sweep) → B-8 (security +
> scalability audit). Process one at a time through the agent pipeline.

### [B-2] Shrink the delete-zone button in zone properties
**Priority**: P1 (next)
**Status**: ✅ done (2026-07-08 — reviewed clean; see `docs/active/tasks/B-2-shrink-delete-zone-button/`)
When editing a zone, the "Delete zone" button spans the full width of the
properties panel, which makes a destructive action feel oversized and prominent
relative to its importance. Make it visually smaller and less dominant (e.g. not
full-width, sized to its label) while keeping it clearly a danger action and
easy to hit. No change to delete behaviour or confirmation.
_Touch points:_ `src/Tidansu.App/src/components/space/editor/ZoneProps.vue`
(the `variant="danger"` BaseButton, ~line 163).

### [B-3] Levels (tiers) control — full-width and a bit bigger
**Priority**: P1
**Status**: ✅ done (2026-07-08 — reviewed clean; see `docs/active/tasks/B-3-levels-control-full-width/`)
In the zone properties panel the "Levels (tiers)" control currently sits in a
single narrow grid column and looks cramped next to the other controls. Make it
span the full width of the zone properties panel and be slightly larger/clearer,
so adding shelves to a unit feels deliberate and readable. Purely a layout/visual
refinement — the level count logic, min/max (1–12) and the shelf preview stay the
same.
_Touch points:_ `src/Tidansu.App/src/components/space/editor/ZoneProps.vue`
(the `<!-- Levels -->` block, ~lines 68–107, and its grid placement).

### [B-4] Real login email for production
**Priority**: P1
**Status**: ✅ done (2026-07-08 — backend + hardening done & reviewed; **pending owner action**: create Brevo account + set `SmtpSettings__*` env vars, then run the real-send verification per `docs/active/tasks/B-4-real-login-email/SETUP.md`)
Today the magic-link sign-in email is only written to a local HTML file in
development and there is no working provider in production, so real users on a
deployed environment can't actually receive their sign-in link. Wire a real
transactional email provider so that in production the magic-link email is
genuinely delivered to the user's inbox, while local development keeps writing
the email to a file (no external calls in dev). The provider choice is left to
the requirements/tech-lead stage; must be configured via environment/secrets (no
keys in source) and fail safely if misconfigured. Success = on a prod-like
environment, requesting a link sends a real email that signs the user in.
_Touch points:_ `src/Tidansu.Infrastructure/Services/EmailService.cs`,
`MagicLinkEmailSender.cs`, `Extensions/ServiceCollectionExtensions.cs`,
`src/Tidansu.API/Program.cs` + `appsettings*.json` (FluentEmail sender config).

### [B-5] Legal & compliance to charge customers in Poland (research)
**Priority**: P1
**Status**: unprocessed
Before connecting real payments we need to know whether — and under what
conditions — the owner (based in Poland) can legally sell a paid SaaS
subscription to customers. This is a **research write-up**, not a code feature:
investigate business registration options, VAT / EU OSS obligations, consumer
protection (right of withdrawal for digital goods, T&C and required pre-purchase
disclosures), invoicing requirements, and GDPR obligations for a paid app; record
findings and open questions to a doc for the owner to confirm with a real
accountant/lawyer. This gates B-6 (real Stripe) — its outcome may change whether
and how we flip Stripe to live. Deliverable is a research document, not shipped
code.

### [B-6] Connect real Stripe (test-mode in dev, live in prod)
**Priority**: P2 (after B-5)
**Status**: unprocessed
The Stripe billing seam already exists (`StripeBillingService` + checkout +
`/api/billing/webhook`) but is off by default and has never been tested against a
real Stripe account. Connect a real Stripe account so upgrades genuinely charge:
Checkout works, the webhook applies Pro on payment with signature verification,
and downgrades/cancellations are handled. Local/dev uses Stripe **test mode**;
production uses **live** keys. All keys/secrets via environment (never in source).
Depends on B-5 clearing the legal path to charge. Success = a real (test-mode)
purchase flips the account to Pro via the webhook end-to-end.
_Touch points:_ `src/Tidansu.Infrastructure/Services/StripeBillingService.cs`,
billing command/handlers in `Tidansu.Application`, `BillingController`, prod
config; possibly Kiota regen if the billing contract changes.

### [B-7] Production-readiness sweep
**Priority**: P2
**Status**: unprocessed
Once the real integrations (B-4, B-6) are in, do a focused pass to make a deployed
build genuinely work end-to-end: verify every core flow on a prod-like config
(auth → spaces/zones/items → plan caps/paywall → billing), ensure all
configuration is environment-driven (URLs, CORS, secrets, DB connection), confirm
no dev-only shortcuts leak into prod (e.g. `VITE_DISABLE_AUTH`, dev email file
path, returned dev magic-link), and tidy any remaining rough edges found. Not a
rewrite — a verification-and-hardening sweep with a checklist of what was proven.
_Touch points:_ `appsettings*.json`, `Program.cs`, `.env`/Vite config,
`ErrorHandlingMiddleware`, CORS/auth config; whole-app drive.

### [B-8] Security & scalability audit (UI + backend)
**Priority**: P3
**Status**: unprocessed
A final pre-launch audit across the whole app: backend security (IDOR/ownership on
spaces/zones/items, plan-limit bypass, auth/token handling, billing/webhook
integrity, input validation, redirect safety) and scalability (N+1 queries,
missing indexes, unbounded payloads, per-request work that won't hold under load),
plus a UI/UX correctness sweep. Produce a prioritized findings report; fixes for
critical/major issues are follow-up tasks. Best run with the `security-reviewer`
agent plus the branch reviewer.
_Touch points:_ whole codebase; EF queries/indexes in `Tidansu.Infrastructure`,
controllers/handlers, auth & billing surfaces, `TidansuDbContext`.

---

### [B-1] Example — item photos on Pro (illustrative, not scheduled)
**Priority**: —
**Status**: unprocessed
Pro users can attach a photo to any item so they can recognise it at a glance
in the layout view. Free users see the camera control but hitting it opens the
paywall with `reason: photos`. Photos count toward nothing extra beyond the Pro
gate. This is illustrative — kept as a format example.
