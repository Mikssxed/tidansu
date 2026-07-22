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
**Status**: ✅ done (2026-07-12 — research delivered: `docs/legal/poland-payments-compliance.md`; see `docs/active/tasks/B-5-poland-payments-legal-research/`. **Verdict:** Stripe does tax calc/collection/invoicing worldwide but registration + filing + KSeF stay the owner's job; PL-specific numbers flagged lower-confidence for accountant/lawyer to confirm before B-6 goes live.)
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

### [B-8] Security & scalability audit (UI + backend)
**Priority**: P3
**Status**: ✅ done (2026-07-14 — audited; see `docs/active/tasks/B-8-security-scalability-audit/review.md`.
**0 Critical · 8 Major · 9 Minor.** Core data path verified clean (IDOR/ownership,
billing/webhook integrity, redirect safety, auth/token, DB indexes). 8 Majors carved off
as B-12–B-19; 5 Minors fixed inline (S-5 JWT-secret guard scope, S-7 reset SyncOn on
downgrade, S-8 reject /0 proxy ranges, U-4 guard CreateSpace finish, U-5 revert sync toggle).
Remaining Minors S-3/S-4/S-6/SC-4/SC-5 left as low-priority hardening in the report.)
A final pre-launch audit across the whole app: backend security (IDOR/ownership on
spaces/zones/items, plan-limit bypass, auth/token handling, billing/webhook
integrity, input validation, redirect safety) and scalability (N+1 queries,
missing indexes, unbounded payloads, per-request work that won't hold under load),
plus a UI/UX correctness sweep. Produce a prioritized findings report; fixes for
critical/major issues are follow-up tasks. Best run with the `security-reviewer`
agent plus the branch reviewer.
_Touch points:_ whole codebase; EF queries/indexes in `Tidansu.Infrastructure`,
controllers/handlers, auth & billing surfaces, `TidansuDbContext`.

### [B-9] Harden the Stripe webhook endpoint (rate-limit + body cap)
**Priority**: P3
**Status**: ✅ done (2026-07-14 — built, live-verified & reviewed clean; see `docs/active/tasks/B-9-harden-stripe-webhook/`. Endpoint-wide 60/min rate limit + 512 KB body cap on `/api/billing/webhook`; oversized→413, over-rate→429, both before signature verification.)
Follow-up from the B-6 security review. The Stripe webhook (`/api/billing/webhook`) is
necessarily `[AllowAnonymous]`, so signature verification is its only gate. Add
defence-in-depth so a flood of junk payloads can't tie up the app: a per-endpoint rate
limit and a maximum request-body size (reject oversized bodies before reading). Low risk
today, but cheap insurance on an internet-facing anonymous endpoint.
_Touch points:_ `src/Tidansu.API/Controllers/BillingController.cs`, `Program.cs`
(rate-limiter + request-size limits).

### [B-10] Handle delayed/async Stripe payment methods
**Priority**: P3
**Status**: ✅ done (2026-07-14 — built, live-verified via hand-signed HMAC webhook fixtures &
reviewed clean; see `docs/active/tasks/B-10-handle-async-stripe-payments/`. Both
`checkout.session.async_payment_succeeded` (grants Pro via the shared `ClientReferenceId`-only
handler) and `checkout.session.async_payment_failed` (silent no-op, stays Free) now route through
the existing idempotency ledger. 0 Critical/Security findings; 1 Major + 1 Minor log/comment nit
fixed inline. Dormant until delayed payment methods are enabled. **Changes left uncommitted.**)
Follow-up from B-6. Pro is granted only when `checkout.session.completed` reports
`PaymentStatus == "paid"` (correct for cards). Delayed-notification methods (e.g. SEPA
debit, some wallets) can complete checkout with payment still pending, then settle later —
so those buyers would pay and never get Pro. If/when such methods are enabled, handle
`checkout.session.async_payment_succeeded` (grant Pro on settlement) and
`checkout.session.async_payment_failed` (leave on Free). Not needed while card-only.
_Touch points:_ `src/Tidansu.Infrastructure/Services/StripeBillingService.cs` (webhook
event dispatch).

### [B-11] Bump dependencies flagged by NU1903 advisories
**Priority**: P3
**Status**: ✅ done (2026-07-14 — built, Kiota-regen-verified & reviewed clean; see
`docs/active/tasks/B-11-bump-vulnerable-deps/`. Build now emits **0 `NU1903`**: bumped
`Swashbuckle.AspNetCore 10.1.2 → 10.2.3` (lifts transitive `Microsoft.OpenApi` to patched
2.7.5; global CLI updated to match), pinned `System.Security.Cryptography.Xml 9.0.15`. AutoMapper
was **not** bumped — clearing its advisory forces v15, which requires a commercial license, so the
advisory is **suppressed via `NuGetAuditSuppress`** (scoped to GHSA-rvv3-g6hj-g44x, in all three
consuming `.csproj`) as an interim pending a licensing decision. Review: 0 Critical/Major, 2
optional Minors (centralize the suppress; `PrivateAssets` on the pin) shipped as-is. Changes left
uncommitted.)
The build surfaces `NU1903` known-vulnerability advisories on transitive/direct packages:
`AutoMapper 12.0.1`, `System.Security.Cryptography.Xml 9.0.0`, and `Microsoft.OpenApi 2.4.1`.
None are B-6-specific — they pre-date it — but they should be reviewed and bumped to patched
versions (minding the Swashbuckle/OpenApi version-match constraint that the Kiota regen
tooling depends on). Verify build + a Kiota regen still work after the bump.
_Touch points:_ `*.csproj` package references; re-verify `npm run build:api`.

### [B-12] Close the Free space-cap concurrency race (S-1)
**Priority**: P2
**Status**: ✅ done (2026-07-15 — built, concurrency-verified & reviewed; see
`docs/active/tasks/B-12-close-space-cap-race/`. Cap now enforced atomically via a per-user
exclusive `sp_getapplock` + authoritative in-lock re-count in a new
`ISpacesRepository.AddWithinSpaceCapAsync`; Pro (unlimited) bypasses the lock entirely. No EF
migration, no Kiota regen (403 `{plan:["spaces"]}` contract unchanged). **Proven:** 25
truly-concurrent creates at 1 space → exactly 1×200 / 24×403 / 0×500, count held at 2; Pro
10-way → 10/10×200. Both reviewers converged on one Major — `sp_getapplock` reports via a
stored-proc **return code**, not an exception, and discarding it **failed open** on lock
timeout; fixed (capture code, `<0` → log + rollback + throw as a 500, not a false `reason:
spaces`) and proven fail-closed by holding the lock from a second connection (blocked 5.11 s →
500, **zero** inserts). Minors S-N1 (SHA-256 fixed-width lock key) + S-L1 (timeout logging)
fixed; N1 (`PlanCaps.For` evaluated twice) accepted as negligible. Changes left uncommitted.)
From the B-8 audit (🟠 S-1). The Free 2-space cap is enforced with a read-then-insert in
`CreateSpaceCommandHandler` — count is read, then the space is inserted in a separate
non-locking round-trip, with no DB-level constraint. A user at 1 space firing several
concurrent `POST /api/spaces` can have every request read count < 2 and all insert,
exceeding the paid cap. Enforce the count-check + insert atomically (serializable
transaction or a DB-level per-user space-count constraint) so parallel POSTs can't both
pass the gate. This is a genuine plan-limit bypass, though it needs deliberate concurrency.
_Touch points:_ `src/Tidansu.Application/Spaces/Commands/CreateSpace/CreateSpaceCommandHandler.cs`,
`src/Tidansu.Infrastructure` (repository / DB constraint).

### [B-13] Validate the space zone/item graph + photo content-type/size (S-2)
**Priority**: P2
**Status**: ✅ done (2026-07-15 — built, driven & double-reviewed; see
`docs/active/tasks/B-13-validate-space-graph-photos/`. **0 Critical, 0 security Major.** The S-2 hole
is proven shut: a `<script>` payload declaring `data:image/png;base64,` → 400, nothing written.
`PhotoPolicy` (Domain, pure, 51 unit tests) validates the data URL span-based with no regex and no
multi-MB allocation — cheap rejects first, arithmetic decoded-size check, then a 12-byte magic-byte
sniff that must **agree** with the declared type (defeats a spoofed prefix). JPEG/PNG/WebP only; SVG
excluded as a script vector. Photo check lives in the **handler**, not FluentValidation, so the Free
plan gate still wins (Free + invalid photo → **403** `photos`, not 400 — verified). Field/tag bounds
(DB-parity) stay in FluentValidation; `[RequestSizeLimit(24MB)]` + 413 added. No EF migration; Kiota
regen was needed (413 only, +2/+2). B-12's app-lock untouched (5 concurrent POSTs → 1×200/4×403).
Review's one Major (M1, `tags:null` → 500) was **disproven by driving** — MVC ModelState 400s it
before FluentValidation runs; the `NotNull()` was kept as defence-in-depth. Tag constants moved to
`ItemCaps`. **Residual (documented, inherited by B-16):** header-only sniffing lets a polyglot
(PNG header + script tail) be stored — inert while photos are only ever `<img>` sources, dangerous
if B-16 serves them with a stored `Content-Type`. Spawned **B-20** (mixed-language validation
errors). Changes left uncommitted.)
From the B-8 audit (🟠 S-2). Create/Update space validators bind only `Space.Id/Name/Type`;
the `Zones`/`Items` collections and their fields are unvalidated at the app layer, so
over-long fields 500 (via `DbUpdateException`) instead of returning a clean 400. Worse,
`Item.Photo` is uncapped `nvarchar(max)` with no content-type check — a Pro user can store
arbitrarily large or non-image (`javascript:`, `data:text/html`) data URLs verbatim, which
the SPA later renders as `img` sources. Add FluentValidation rules for the zone/item graph
(lengths matching the DB `HasMaxLength`, tag bounds) and validate `Photo` as an allow-listed
image content-type with a hard per-photo byte cap; reject as 400, don't store.
_Touch points:_ `CreateSpaceCommandValidator.cs`, `UpdateSpaceCommandValidator.cs`, DTOs,
`TidansuDbContext` (photo column).

### [B-14] Account usage counts via projection, not full space-graph load (SC-1)
**Priority**: P2
**Status**: ✅ done (2026-07-15 — built, SQL-log-verified & reviewed clean; see
`docs/active/tasks/B-14-usage-counts-projection/`. **0 Critical, 0 Major.** Usage now comes from
one narrow round-trip — `Spaces.Where(s => s.UserId == userId).Select(s => s.Items.Count)` — that
emits a single `COUNT(*)` correlated subquery: no `Zones`, no `Item.*`, no `Photo` blob, no
split-query trio. No EF migration, no Kiota regen (account response shape unchanged).
**Scope widened at the requirements gate:** the backlog named only `GetAccountQueryHandler`, but
the identical `GetAllByUserAsync` → `UsageDto.From` pattern also fed `ChangePlanCommandHandler` and
`SetSyncCommandHandler` — all **three** were swapped, or SC-1 would have been only a third fixed.
`UsageDto.From` was retyped `List<Space>` → `List<int>` deliberately so the compiler proves every
call site moved. `GetSpacesQueryHandler` correctly left on the full graph (B-16's territory).
**Proven by driving** (EF SQL log, not just output — the slow path also produced correct numbers):
zero spaces → `0/0/0` no 500 (the `Count == 0` guard kept verbatim; dropping it would 500 every new
signup's first account load), 2 empty → `2/0/0`, 3+1 → `2/4/3`, tie 3+3 → `2/6/3`, Pro photo item →
correct with no `Photo` column; all three surfaces one statement each; Free-at-2-spaces still
`403 {"plan":["spaces"]}`; post-downgrade over-cap still reports true `3/6/3`. Ownership filter
verified character-identical to `GetAllByUserAsync`'s. 2 Minors left open by design: the guard has
no automated test home (`Domain.Tests` can't reach Application — needs a standalone structural
decision), and `GetAllByUserAsync` is now single-caller so its `Include`/`AsSplitQuery` shape could
be narrowed — deferred to **B-16**, which reworks that same method. Changes left uncommitted.)
From the B-8 audit (🟠 SC-1). The account page's `GetAccountQueryHandler` loads the whole
space graph — every zone and every item, including `Item.Photo` data-URL blobs — only to
compute three integers (spaces, item count, max items). A Pro user with a few hundred photo
items pulls multiple MB across the wire and into memory on every account-page load. Replace
with a projection/aggregate query (`CountAsync`/`GroupBy`) that never materializes zones,
items, or photos; add a counts-only repository method.
_Touch points:_ `src/Tidansu.Application/Account/Queries/GetAccount/`, `SpacesRepository.cs`,
`UsageDto.cs`.

### [B-15] Granular item/zone endpoints instead of delete-all/re-insert on every save (SC-2)
**Priority**: P3
**Status**: ✅ done (2026-07-16 — built, both-reviewer'd & hardened; merged as PR #2 `cddb15b`;
see `docs/active/tasks/B-15-granular-space-endpoints/`. The backlog offered two routes; the user
chose the heavier one at kickoff: **granular per-entity endpoints**, not a diff inside
`ReplaceAsync`. `PUT /api/spaces/{id}` and `ReplaceAsync` are **retired**, replaced by
`SpaceZonesController` + `SpaceItemsController` and a scalar-only `PUT /api/spaces/{id}/fields`.
The plan gate decomposed by algebra — for an add `after = before + 1`, so the old
`after > cap ∧ after > before` reduces exactly to `before >= cap`; updates/deletes change no
count and so get **no gate call at all**, and that absence *is* the downgrade-stays-editable
rule. FR-9's per-space add race is closed with B-12's `sp_getapplock` pattern, keyed per-space,
one resource for zones+items, Free-only. **No EF migration** — a checked conclusion (D-5), not
an omission. Review fixed a 🔴 zone-delete/item-op ordering race (silent data loss) + 4 🟠;
the client-supplied-PK DoS was checked for attribution, found **pre-existing**, and split out
as **B-22**.)
From the B-8 audit (🟠 SC-2). `SpacesRepository.ReplaceAsync` deleted and re-inserted all zones
and items on every debounced whole-space PUT, so renaming one item in a 50-item space issued
~100 DELETE + ~100 INSERT and rewrote every item's photo blob instead of a single-row UPDATE
— heavy write amplification and index churn under load. Design change.
_Touch points:_ `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs`,
`UpdateSpaceCommandHandler.cs`, possibly the frontend save path.

### [B-16] Paginate/slim the spaces list; stop returning photo data-URLs inline (SC-3)
**Priority**: P3
**Status**: done — shipped (commits bfa979b + b002069). Payload fix only per the third scope
decision; photo upload/display/serving split to B-1. Read path now serves a paginated,
photo-less summary + a photo-less full graph; `GET /api/spaces` measured 120,418,315 → 968 bytes.
Driven-verified (FR-1 SQL-proven, FR-3 DB-proven, FR-6/M1 in-browser). See
`docs/active/tasks/B-16-slim-spaces-list/`.
From the B-8 audit (🟠 SC-3). `GET /api/spaces` returns every space, zone and item with each
`Photo` base64 inline and no paging, all eagerly loaded on app boot. A heavy Pro account
returns a tens-of-MB response that grows unbounded. Two tracks: (a) don't ship photo blobs in
the list — return a reference/URL and fetch the image separately (ideally move photos to blob
storage rather than `nvarchar(max)`); (b) introduce paging or per-space lazy-load so the client
isn't forced to hold the whole account in memory. Overlaps the photo-storage question; keep
separate from B-10.
**⚠️ Security precondition inherited from B-13** (see its `security-review.md`): B-13 validates a
photo by sniffing only the first 12 bytes against JPEG/PNG/WebP magic bytes, so a **polyglot**
(valid PNG header + HTML/script tail) is stored. That is inert *today* — `<img>` never executes its
content and browsers don't content-sniff `data:` URLs. Serving photos from an endpoint changes
that: if the new endpoint sets `Content-Type` from the stored declared type, the tail becomes a
response body. The global `nosniff` header (`Program.cs`) defuses it **only if the new endpoint
inherits that middleware** — verify it does, and prefer serving from a separate origin/bucket with
a fixed content type. Do not treat B-13's validation as sufficient once photos are served.
**Inherited from B-14 (deferred here by decision, not oversight):** B-14 moved the account-usage
counts off `ISpacesRepository.GetAllByUserAsync`, so `GetSpacesQueryHandler.cs:15` is now its
**only** caller. That method's `Include`(zones+items) + `AsSplitQuery` shape therefore exists solely
to serve the layout view and could be renamed/narrowed to say so — a real deepening opportunity that
was left for B-16 precisely because B-16 reworks that same method. Weigh it as part of this task
rather than re-deriving it.
_Touch points:_ `GetSpacesQueryHandler.cs`, `SpacesRepository.cs`, DTOs, `App.vue`/`useSpacesStore.ts`.

### [B-17] Reflect read-only over-cap spaces after downgrade in the UI (U-1)
**Priority**: P2
**Status**: done
From the B-8 audit (🟠 U-1). The product rule and the app's own FAQ (`PricingView`) promise that
after a downgrade, spaces/items beyond the Free limits become read-only — but nothing in the SPA
enforces it. Guards only block *adding* past a cap, so a Pro user who drops to Free keeps all
over-cap spaces fully editable (rename, add/edit/remove items, add zones) — the opposite of what
the UI tells them. Derive a per-space over-cap/read-only flag (spaces beyond `caps.spaces`,
deterministic sort), disable the mutating affordances, and badge them "Read-only — upgrade to
edit". (Server-side enforcement of the same is a separate concern.)
_Touch points:_ `src/Tidansu.App` — `useLimits.ts`, `DashboardView.vue`, `SpaceView.vue`.

### [B-18] Loading + error/retry states for spaces hydrate (U-2)
**Priority**: P2
**Status**: done — shipped (commit 166b04b). `hydrate` is now an idle/loading/loaded/failed state
machine; the seed is unreachable on any failure path. Review turned up one 🟠: the two callers
*can* overlap (already-signed-in user opening a fresh magic link), so a module-scoped epoch
counter gates every post-await write and `reset()` orphans in-flight calls. Accessibility
(`role="status"` on the loading block) deliberately left out — pre-existing, matches `SpaceView`.
From the B-8 audit (🟠 U-2). The initial spaces load (`App.vue` → `useSpacesStore.hydrate`) is
fire-and-forget with no loading or error state. A failed fetch (offline, 500, expired token)
leaves `spaces = []`, so `DashboardView` shows "No spaces yet" to a user who *has* data — and
can trigger the starter-fridge seed as if it were a brand-new account. Even the happy path
flashes the empty state until the fetch resolves. Expose TanStack Query's `isLoading`/`isError`,
render a spinner during load and an error+retry panel on failure, and gate the empty-state/seed
on a *successful empty* response only.
_Touch points:_ `App.vue`, `src/Tidansu.App/src/stores/useSpacesStore.ts`, `DashboardView.vue`.

### [B-19] Surface (not swallow) non-plan space-sync failures (U-3)
**Priority**: P2
**Status**: ✅ done (2026-07-20 — built, driven-verified & reviewed; see
`docs/active/tasks/b-19-surface-space-sync-failures/`. Global dismiss-only toast on any
non-plan sync failure, auto-dismissing at 6s, hosted app-level so it is view-independent;
plan-cap failures still open the paywall and raise no toast.)

From the B-8 audit (🟠 U-3). Space create/update/delete mutate the store optimistically then
persist, and only the plan-limit 403 was handled — every other failure (network, 500, 401)
was `console.error`-only. The user saw the edit "succeed" locally, got zero feedback that it
never persisted, and lost it on reload.

**Note — this entry's original text was already stale when the task was picked up.** It
described `handleSyncError` and asked for rollback work, but B-15/16/17/18 had since split
that function into `handleCreateError` / `handleDeleteError` / `recordFailure` and had
*already implemented* rollback (`applyRollback`, `discardSpaceLocally`) plus per-mutation
tracking in `saveState`. The delivered scope was therefore presentation-only: rendering the
failure `saveState` was already recording but nothing consumed. Retry was explicitly
rejected — replaying a rolled-back op would reopen the `ChangeSet`/flush machinery B-15/16
had just stabilized, and rollback already leaves local state consistent.

Shipped: `saveMessage` + `dismissSaveMessage()` on the store (mirroring `setPlan`'s
transient-message pattern), a new `BaseToast` base primitive, and an `alert` glyph in
`icons.ts` — deliberately distinct from `lock`, which stays reserved for plan gates, so a
generic failure never looks like a paywall. Coalescing is one message per flush window.
_Touch points:_ `src/Tidansu.App/src/stores/useSpacesStore.ts`,
`src/Tidansu.App/src/components/base/BaseToast.vue`, `src/Tidansu.App/src/components/icons.ts`,
`App.vue`.

### [B-25] SPA over-cap badging can disagree with the server's read-only set
**Priority**: P2
**Status**: unprocessed
Follow-up carved out of B-23/B-24 review (Low, cross-feature). The SPA marks which
spaces are over-cap (read-only after downgrade) by **array position** —
`spaces.slice(caps.spaces)` in `src/Tidansu.App/src/composables/useLimits.ts` — but
B-23 switched `Space.Id` to server-assigned random ids, so the store's array order no
longer tracks the server's authoritative `OrderBy(s => s.Id)` order, and
`reconcileSpaceId` doesn't re-sort. The server (B-24) independently freezes exactly
`total - caps.spaces` spaces by `OrderBy(Id)` every request, so **this is not a
security bypass** — enforcement is correct regardless. But the SPA can *badge* a
different set than the server actually makes read-only, so a user may see the wrong
space greyed out (and try to edit a space the server will 403, or vice-versa). Make
the SPA's over-cap selection agree with the server's: badge by the same stable
`Id` order (sort by `Id` before slicing), or have the badge follow the server's
truth. Verify by downgrading a multi-space account and confirming the badged spaces
are exactly the ones whose mutations 403.
_Touch points:_ `src/Tidansu.App/src/composables/useLimits.ts` (the `slice`-based
over-cap selection), possibly `src/Tidansu.App/src/stores/useSpacesStore.ts`
(ordering after `reconcileSpaceId`). See
`docs/active/tasks/B-23-scoped-space-keys/security-review.md` § S-L1 and
`docs/active/tasks/B-24-server-overcap-readonly/review.md`.

### [B-23] `Space.Id` is globally unique + client-supplied → the same cross-tenant DoS, one level up
**Priority**: P1
**Status**: unprocessed
From the B-22 security review (🟠 S-H1). **B-22 fixed `Zone` and `Item`; `Space` was never in its
scope and is still fully exposed** — this is the identical bug on the parent entity, not a variant.
The same four facts compose:
1. `modelBuilder.Entity<Space>` has **no `HasKey`** — EF's convention makes `Id` alone the PK, so
   one space id is unique across every tenant.
2. `SpaceDto.ToEntity:32` takes `Id` from the client verbatim; `CreateSpaceCommandHandler` has no
   in-space/duplicate pre-check of any kind.
3. `uid('space')` in `src/Tidansu.App/src/data/spaces.ts` is the same clock-derived generator with
   only **46,656** reachable suffix values, cycling every ~47s (the counter resets on page load).
4. Pro has **unlimited spaces** and `POST /api/spaces` has **no rate limiter**.

So a Pro account can squat the space-id range and force every other user's *first space creation*
to a 500 — the exact attack B-22 exists to kill — plus the same 200-vs-500 cross-tenant existence
oracle. **B-22's new `DbUpdateException` clause does NOT close this**: it suppresses the exception
*message* but still emits a 500, so the distinguishing signal survives intact.

**Beware a specific trap.** B-22 left confident comments across `SpacesRepository.cs` and
`TidansuDbContext.cs` about space-scoping now being "structural" and tenant isolation being
"load-bearing". Those are accurate **for `Zone`/`Item` only** — they read repo-wide and make this
remaining gap harder to see (flagged as 🟡 S-L2 in B-22's security review). Do not read them as
covering `Space`.

The fix is the same shape as B-22's but has **no composite-key option** — `Space` is the tenancy
root, so there is no parent id to scope against. The real choice is between a **server-assigned id**
(or CSPRNG) and **`(UserId, Id)` as the key**; both need an EF migration and a decision about the
client contract, and the second changes the optimistic-add path B-22 deliberately protected. Weigh
it properly at the tech-planning gate rather than assuming B-22's answer transfers.
_Touch points:_ `src/Tidansu.Infrastructure/Persistence/TidansuDbContext.cs`, a new migration,
`src/Tidansu.Application/Spaces/Dtos/SpaceDto.cs` (`ToEntity`), `CreateSpaceCommandHandler.cs`,
`src/Tidansu.App/src/data/spaces.ts` (`uid`), and the misleading B-22 comments noted above.
See `docs/active/tasks/B-22-scoped-zone-item-keys/security-review.md` § S-H1.

### [B-22] Zone/Item primary keys are globally unique + client-supplied → cross-tenant DoS
**Priority**: P1
**Status**: ✅ done (2026-07-21 — built, both-reviewer'd & hardened; see
`docs/active/tasks/B-22-scoped-zone-item-keys/`). Shipped the composite key
`(SpaceId, Id)` on `Zone` and `Item` chosen at kickoff over server-assigned ids and a CSPRNG
`uid()` — so the client's clock-derived `uid()` is deliberately unchanged. The feared data
migration never materialised: `(Id)` was already unique table-wide, so `(SpaceId, Id)` is unique
*a fortiori* and `ADD PRIMARY KEY` **cannot fail on any dataset** — zero rows change, one EF
migration, no raw SQL. There is **no `Item` → `Zone` FK** (the brief's designated highest risk),
so nothing needed re-pointing; not adding one was a user decision, not an oversight. Also shipped:
defence-in-depth caps (500 zones / 5,000 items per request) and intra-request duplicate-id rules in
`SpaceDtoValidator`, in-space duplicate-id pre-checks in the `AddZone`/`AddItem` handlers, a
`DbUpdateException` clause in `ErrorHandlingMiddleware`, and explicit space-correlation in
`RemoveItemAsync`. Review found **no 🔴**; two 🟠 both in `SpaceDtoValidator` and both fixed
inline — the duplicate-id rule used ordinal `Distinct()` while the key it guards is enforced under
`SQL_Latin1_General_CP1_CI_AS`, so `z1`/`Z1` (and trailing-space ids) passed validation and died at
`SaveChangesAsync` as a 500; and the cap rules NRE'd on explicit JSON `null`. **The residual is
filed as [B-23]** — `Space.Id` has the identical unfixed bug one level up. Root cause of both 🟠s:
there is no `Tidansu.Application.Tests` project, so no suite could have caught validator logic.
From the B-15 security review (🟠 S-H1). **Pre-existing — not introduced by B-15**, but B-15's
review is what surfaced it. Three facts compose into a cross-tenant denial of service:
1. `PK_Zone` / `PK_Item` are on `x => x.Id` **alone** (`Migrations/20260621142555_SpacesZonesItems.cs:57,90`)
   — `SpaceId` is only an FK. **One zone id is therefore unique across every tenant.**
2. `ZoneDto.ToEntity`/`ItemDto.ToEntity` take `Id` from the client verbatim; the validators only
   check `NotEmpty().MaximumLength(64)`.
3. The client generates ids with a clock, not a CSPRNG (`src/Tidansu.App/src/data/spaces.ts:39-41`):
   `` `${p}_${(++_id).toString(36)}${Date.now().toString(36).slice(-3)}` ``. `_id` resets to 0 on
   every page load, so a session's **first** zone is always `zone_1<suffix>`, and the suffix is the
   low 3 base36 digits of the ms epoch — only **46,656** values, cycling every ~47s.

A Pro account (zones/items uncapped) can insert the entire `zone_1***` id space into its own space.
Every other user's first zone-add then hits a PK violation → `DbUpdateException` → **500**, and
reloading resets `_id` and re-collides. It is also a global existence oracle (200 vs 500).

**Attribution, checked at the B-15 review gate — do not "fix" this by reverting B-15.** The review
argued B-15 made the attack cheaper; the orchestrator verified the opposite. `SpaceDtoValidator`
puts **no limit on the number** of zones/items, Pro's zone cap is `null` so `CheckNewSpace` skips
the check entirely, and `POST /api/spaces` allows 24 MB — at ~200 bytes per zone DTO that is
**~120,000 zones in a single request**, more than covering the 46,656-value space. B-15 never
touched `POST /api/spaces`. So the attack was already possible in **one** request; post-B-15 it
*also* works via 46,656 individually rate-limitable requests, i.e. strictly **harder**.

Real fix is a composite key — `HasKey(z => new { z.SpaceId, z.Id })` — which **requires an EF
migration plus a data migration for existing rows**, and a decision about whether client-supplied
ids should survive at all (server-assigned ids or a CSPRNG `uid()` would each close it differently).
That is why this is its own slice and was not folded into B-15, whose D-5 correctly concluded *that
task* needed no migration. Consider also capping zone/item counts in `SpaceDtoValidator` as cheap
defence-in-depth regardless of the key decision.
_Touch points:_ `src/Tidansu.Infrastructure/Persistence/TidansuDbContext.cs`, a new migration,
`src/Tidansu.App/src/data/spaces.ts` (`uid`), `SpaceDtoValidator.cs`, `ZoneDto`/`ItemDto.ToEntity`.

### [B-21] Fix `npm run build:api` — `swagger tofile` can't find a `Startup`
**Priority**: P3
**Status**: unprocessed
The documented way to regenerate the frontend's API client (`npm run build:api` in
`src/Tidansu.App`) has never actually worked. Its first step, `build:api-file`
(`swagger tofile … Tidansu.API.dll v1`), fails with *"A type named 'Startup' could not be found"* —
so every task needing a regen (B-6, B-9, B-11, B-13) has hand-run a workaround instead: boot the API
with an empty connection string and `curl` `/swagger/v1/swagger.json` out of the running app, then
run the remaining three steps by hand. That's slow, easy to get wrong, and means the documented
command in `CLAUDE.md` is a trap for anyone new.
**Diagnosed, not guessed:** this is **not** the Swashbuckle/OpenApi version-match problem from B-11
— B-11 bumped the API to `Swashbuckle.AspNetCore` 10.2.3 and updated the global CLI to match, and
the error persisted. The real cause is structural: `grep -rn "class Startup" src/` returns **nothing**.
The API uses minimal hosting (top-level statements in `Program.cs`), and the Swashbuckle CLI builds
the host by reflection expecting the older `Startup`/`CreateHostBuilder` shape. Version-matching can
never fix that.
Make one documented command work end-to-end. Options for the tech-lead to weigh: promote the
running-app fetch to be the real `build:api-file` step (proven — it's what everyone already does);
switch to build-time OpenAPI document generation (`Microsoft.Extensions.ApiDescription.Server`, or
.NET's newer built-in OpenAPI doc generation, both of which support minimal hosting); or add a
`Startup` shim purely to satisfy the CLI (least attractive — ceremony for a tool's benefit). Success =
a clean clone runs `npm run build:api` and gets a correct client, with no manual steps and no
version-pinning tribal knowledge.
_Touch points:_ `src/Tidansu.App/package.json` (the `build:api*` script chain),
possibly `src/Tidansu.API/Tidansu.API.csproj` + `Program.cs`, `CLAUDE.md` (the documented command),
and the `kiota-regen-tooling` note. Verify by regenerating from a clean clone and confirming the
client diff is empty against the committed one.

### [B-20] Pin a culture so validation errors aren't mixed-language
**Priority**: P3
**Status**: unprocessed
Found while driving B-13's verification. The API pins no culture — there is no `CultureInfo`,
`RequestLocalization` or `InvariantGlobalization` setting anywhere in `Program.cs`, the csproj or
`appsettings*.json` — so FluentValidation's built-in messages localize to whatever the **host OS**
locale is, while every hand-written message in the codebase is English. On a Polish dev box the API
returns *"Długość pola 'Tags' musi być mniejsza lub równa 24 znaki(ów)"* for a too-long tag but
*"'Tags' must contain no more than 15 items."* for too many tags — same form, two languages. The
user-visible result varies by deploy host, which also makes it a reproducibility trap. Pre-existing,
but B-13 widened it a lot by adding ~15 validation rules. Decide the product position (the UI is
English-only today: pin invariant/en-US, most likely) and apply it once, centrally. If real i18n is
ever wanted, that's a much larger piece of work — this item is just about making the app pick one
language on purpose instead of by accident.
_Touch points:_ `src/Tidansu.API/Program.cs` (culture config), possibly `Tidansu.API.csproj`
(`InvariantGlobalization`); verify by driving a validation failure and checking the message language.

### [B-24] Server-side enforcement of read-only over-cap content after downgrade
**Priority**: P2
**Status**: unprocessed
Follow-up carved out of B-17. B-17 makes over-cap spaces read-only **in the SPA only** — it disables
the mutating affordances and badges the spaces, but the API still accepts the mutations. A downgraded
(Free) user holding a valid JWT can therefore still rename, add zones/items to, or otherwise mutate a
space beyond `caps.spaces` by calling the endpoints directly, bypassing the UI. This is the
server-side half of the product rule "downgrade keeps data but makes over-cap content read-only":
the mutate handlers (space update, zone/item create/update) must reject writes to over-cap spaces
for a Free-plan user with the same deterministic over-cap selection the SPA uses (spaces beyond
`caps.spaces` by stable `OrderBy(s => s.Id)` order), returning a plan-limit error the SPA already
knows how to surface. Delete must stay allowed (it's the recovery path back under the cap). Until
this lands, B-17 is UX honesty only, not a real access control.
_Touch points:_ `Tidansu.Application` mutate handlers (space update, zone/item create/update) +
their validators/authorization; the plan-cap/ownership check already used for adds; `Tidansu.Domain`
plan constants.

---

### [B-1] Example — item photos on Pro (illustrative, not scheduled)
**Priority**: —
**Status**: unprocessed
Pro users can attach a photo to any item so they can recognise it at a glance
in the layout view. Free users see the camera control but hitting it opens the
paywall with `reason: photos`. Photos count toward nothing extra beyond the Pro
gate. This is illustrative — kept as a format example.
