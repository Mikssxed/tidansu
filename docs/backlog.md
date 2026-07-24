# Backlog

The **pm-requirements-analyst** agent reads this file, picks the highest-priority
unprocessed item, and expands it into functional requirements in that item's task
folder — `docs/active/tasks/<id>-<slug>/requirements.md`.

Each item is a coarse product idea in **business language** — not a technical
task. Keep them small enough to be one feature slice. **Once an item ships, remove
it from this backlog** — its full history lives on in its task folder under
`docs/active/tasks/<id>-<slug>/`, so the backlog stays focused on open work rather
than accumulating a wall of completed entries.

> The long-horizon build lives in [`docs/IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).
> This backlog is for **new feature work on top of the finished v1** — one idea
> per bullet, processed through the agent pipeline (see
> [`.claude/agents/README.md`](../.claude/agents/README.md)).

<!-- Add items below. Format:
### [B-N] <one-line title>
**Priority**: P1 (next) | P2 | P3
**Status**: unprocessed | in-progress | ✅ done
<2–4 sentences of product intent in business language. What can the user do that
they couldn't before? Why does it matter? Any known limits/rules.>
-->

## Open for the agent pipeline (top = next)

> No actionable items right now — the only open item (B-27) is blocked until Pro
> sync ships. B-20 (invariant-culture pin) and B-28 (CI + Kiota drift check)
> shipped 2026-07-24 and were removed per the "remove on ship" convention; their
> history lives in `docs/active/tasks/B-20-pin-culture-validation/` and
> `docs/active/tasks/B-28-ci-kiota-drift-check/`.

### [B-27] Sync feature must refresh over-cap flags on its own trigger
**Priority**: P3
**Status**: unprocessed — **blocked** (not actionable until Pro sync ships)
Deferred from B-25 — a design note for whenever Pro sync ships, not actionable
before then. B-25's over-cap badge refreshes on plan-change settlement and on
delete; a future sync channel (another device adding/deleting spaces, or a plan
change landing via webhook while the app is open) introduces new paths that change
the server's over-cap set without firing either trigger, leaving stale badges
until reload. When building sync, wire its "spaces changed remotely" signal to
`useSpacesStore.refreshOverCapFlags()` (merge-only, already epoch-guarded), and
verify the transient windows stay directionally safe (the 403→paywall backstop
covers under-badging).
_Touch points:_ future sync store/composable;
`src/Tidansu.App/src/stores/useSpacesStore.ts` (`refreshOverCapFlags`).
See `docs/active/tasks/B-25-overcap-badge-parity/tech-tasks.md` (deferred Q2).

## Awaiting owner action (code-complete — not agent-processable)

These shipped in code and passed review; the only step left is a **manual
verification the owner must run against real external accounts**. They are not
pipeline work — kept here so the outstanding owner step isn't forgotten.

### [B-6] Connect real Stripe (test-mode in dev, live in prod)
**Priority**: P2
**Status**: ✅ code-complete (2026-07-12 — built, reviewed & hardened; see
`docs/active/tasks/B-6-connect-real-stripe/`. No Critical review findings; 3 Major +
Minor all fixed. **Pending owner action**: run the Stripe **test-mode** verification
drives per `SETUP.md` (needs a Stripe account + `sk_test_` keys + Stripe CLI + LocalDB)
before marking `done`. **Live cutover** is a further gate — see `go-live-cutover.md` +
B-5 §10/§11.)
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
**Status**: ✅ code-complete (2026-07-13 — swept, hardened, reviewed; see
`docs/active/tasks/B-7-production-readiness-sweep/`. **No Critical/Major** in either the
branch or security review; 4 config-hardening edits (fail-loud guards on `FrontendUrl` +
DB connection, env-driven forwarded-header trust, EF-log level) + a proof checklist.
Review nits F1/F2/F3 all fixed & re-verified by driving. **Pending owner action** (per the
"run now, mark E2E pending" decision, recorded in `proof-checklist.md`): FR-2 real email
delivery needs Brevo (B-4); FR-3 live Stripe test-mode purchase needs the B-6 drive; FR-10
real proxy address is an open deploy step. Changes left uncommitted.)
Once the real integrations (B-4, B-6) are in, do a focused pass to make a deployed
build genuinely work end-to-end: verify every core flow on a prod-like config
(auth → spaces/zones/items → plan caps/paywall → billing), ensure all
configuration is environment-driven (URLs, CORS, secrets, DB connection), confirm
no dev-only shortcuts leak into prod (e.g. `VITE_DISABLE_AUTH`, dev email file
path, returned dev magic-link), and tidy any remaining rough edges found. Not a
rewrite — a verification-and-hardening sweep with a checklist of what was proven.
_Touch points:_ `appsettings*.json`, `Program.cs`, `.env`/Vite config,
`ErrorHandlingMiddleware`, CORS/auth config; whole-app drive.

---

### [B-1] Example — item photos on Pro (illustrative, not scheduled)
**Priority**: —
**Status**: unprocessed
Pro users can attach a photo to any item so they can recognise it at a glance
in the layout view. Free users see the camera control but hitting it opens the
paywall with `reason: photos`. Photos count toward nothing extra beyond the Pro
gate. This is illustrative — kept as a format example.
