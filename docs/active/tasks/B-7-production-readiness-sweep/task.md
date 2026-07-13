---
id: B-7
slug: production-readiness-sweep
title: Production-readiness sweep
status: done        # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: [B-4, B-6] # real login email + real Stripe must be in before the end-to-end sweep
touch-points:
  - src/Tidansu.API/appsettings*.json
  - src/Tidansu.API/Program.cs
  - src/Tidansu.App/.env / Vite config
  - src/Tidansu.API (ErrorHandlingMiddleware, CORS/auth config)
  - whole-app end-to-end drive
---

# B-7 · Production-readiness sweep

## Description
Now that the real integrations (B-4 real login email, B-6 real Stripe) are in,
do a focused pass to make a deployed build genuinely work end-to-end. Verify
every core flow on a prod-like config (auth → spaces/zones/items → plan
caps/paywall → billing), ensure all configuration is environment-driven (URLs,
CORS, secrets, DB connection), confirm no dev-only shortcuts leak into prod
(e.g. `VITE_DISABLE_AUTH`, dev email file path, returned dev magic-link), and
tidy any remaining rough edges found. This is a verification-and-hardening sweep
with a checklist of what was proven — **not a rewrite**.

Codebase check during requirements confirms the three named dev shortcuts are
already gated correctly today (auth bypass is `import.meta.env.DEV`-gated and
dead-code-eliminated from a `vite build`; the dev email-to-file path and the
returned `devLink` are both gated on `IWebHostEnvironment.IsDevelopment()`), and
fail-loud startup guards already exist for the JWT signing secret, SMTP, and
Stripe config. Two concrete gaps found that this sweep should close:
(1) the same fail-loud-on-missing-config pattern is **not yet applied** to
`AppSettings:FrontendUrl` or the `TidansuDb` connection string; (2) the
`ForwardedHeadersOptions.KnownProxies`/`KnownNetworks` used by the per-IP rate
limiter is still framework-default (loopback-only) and must be pointed at the
real production proxy at deploy time (already flagged in the B-4 setup doc) or
every user will share one rate-limit bucket. Also worth a quick check: whether
the frontend dev-tools build plugin (`vite-plugin-vue-devtools`) truly excludes
itself from a `vite build` output, and whether production Serilog config should
turn EF Core logging down from `Information` (currently verbose for prod).

## Acceptance criteria
- [x] Every core flow verified on a prod-like config: auth (magic link) →
      spaces/zones/items CRUD → plan caps + paywall (correct `reason`) → billing.
      (Real-email-delivery and live-Stripe-test-mode legs are gated on owner
      completing B-4/B-6 provider setup — record as verified or pending.)
- [x] All configuration is environment-driven — URLs, CORS origins, secrets, DB
      connection — with no secrets in source and safe failure on misconfiguration,
      including extending the existing fail-loud startup pattern to
      `AppSettings:FrontendUrl` and the DB connection string.
- [x] No dev-only shortcut can leak into a prod build: `VITE_DISABLE_AUTH`, the
      dev email-to-file path, and any returned dev magic-link are provably off /
      absent in production (build-output-verified, not just source-inspected).
- [x] Deploy-time reverse-proxy trust (`KnownProxies`/`KnownNetworks`) is
      documented/configured so the auth rate limiter partitions on real client
      IPs behind the actual production proxy.
- [x] Remaining rough edges found during the sweep are tidied or logged as
      follow-up backlog items (deep security/scale findings go to B-8 instead).
- [x] Deliverable includes a checklist recording what was proven and how, with
      pending items naming exactly what unblocks them.

## Notes
- **Tech-planning done (2026-07-13).** See `./tech-tasks.md`. Key decisions for the
  developer: (1) **No migration** — no entity/DbContext change; only composition-root
  guards + config edits. (2) **Only four code edits**, all Stage-3 pause points:
  BA-1 fail-loud on blank `AppSettings:FrontendUrl` (Production) in
  `WebApplicationBuilderExtensions.cs`; BA-2 fail-loud on blank `TidansuDb`
  (Production) in `ServiceCollectionExtensions.cs`; BA-3 env-driven
  `ForwardedHeaders KnownProxies/KnownNetworks` in `Program.cs` (never wildcard,
  never Clear-then-trust-all, blank→loopback-only default); BA-4 EF Core Serilog
  `Information`→`Warning` in base `appsettings.json`. (3) **No Kiota regen** — none
  of the edits touch a controller/DTO/route. (4) Everything else is `[verify]`
  (build-output inspection + prod-like `ASPNETCORE_ENVIRONMENT=Production` run) or
  `[doc]` (the FR-1/FR-13 proof checklist at `./proof-checklist.md`). (5) FR-2/FR-3
  E2E legs stay **pending owner action**; FR-10 real proxy address is an **open
  deploy step**; FR-12 rough-edges **batched for owner review**, security/scale
  findings handed to **B-8**.
- **Depends on B-4 and B-6.** B-4 (real login email) is code-complete pending owner
  Brevo setup; B-6 (real Stripe) is code-complete pending owner test-mode drives.
  Both are "code-done, owner-action-pending" — this sweep verifies the *code* is
  prod-safe; some end-to-end proofs may themselves be gated on the owner completing
  those provider setups (note which in the deliverable).
- ⚠️ **Sensitive surfaces.** This sweep inspects auth, billing, plan gating, CORS,
  and redirect/config handling — the pipeline pauses at implementation steps touching
  those, and Stage 4 should run the **security-reviewer** in addition to the branch
  reviewer.
- **Verification-heavy, not feature work.** Much of the value is proving existing
  behaviour on a prod-like config and closing config/leak gaps — expect small,
  targeted hardening changes plus a proof checklist, not new features.
- Relates to [B-8] (security & scalability audit) — keep genuinely security/scale
  findings scoped to B-8 unless they are trivial prod-config leaks that belong here.
- Full functional requirements (13 FRs across end-to-end verification,
  environment-driven config, dev-shortcut containment, deploy-time proxy trust,
  build/log hygiene, rough-edge triage, and the proof checklist itself): see
  `./requirements.md`.

## Owner decisions (Stage-1 gate, 2026-07-13)
- **Timing (OQ-1): run now, mark E2E pending.** Do all code-verifiable hardening
  now (FR-4–FR-11); mark the real-email (FR-2) and live-Stripe-test (FR-3) legs
  "pending owner action" in the proof checklist rather than blocking the sweep.
- **Topology (OQ-2): single origin (as today).** One host serves API + built SPA
  from one origin → CORS is defence-in-depth only; single-origin config suffices.
  No multi-origin support needed for launch (revisit only if a split deploy appears).
- **Reverse proxy (OQ-3): not known yet.** Record FR-10 as an explicit **open
  deploy step** in the checklist; wire the trusted-proxy config to be env-driven
  but leave the actual trusted address(es) to be set at deploy time. Do NOT trust a
  wildcard.
- OQ-5 (sending-domain timing): treat sending-domain (SPF/DKIM) as a recommended
  post-sweep follow-up (already out of scope per requirements).

## Owner decisions (Stage-2 gate, 2026-07-13)
- **Plan approved** — proceed to implementation (4 code edits BA-1–BA-4 + FE-1,
  then verification + proof checklist).
- **FR-12 rough-edge disposition (OQ-4): batch for owner review.** Collect all
  findings in the checklist's FR-12 table; show the owner the batch before filing
  any GitHub issue. Do NOT auto-file. Security/scale findings still hand off to B-8.

## Stage-4 review complete + fixes applied (2026-07-13) → done
Branch review → [`./review.md`](./review.md); security audit → [`./security-review.md`](./security-review.md).
**No Critical, no Major.** Both reviewers reconfirmed the branch lands exactly the four
approved config edits with zero scope creep (no migration, no Kiota regen, no auth/billing
logic change) and both static gates green. Findings were hardening nits in the BA-3
forwarded-header block; owner chose **fix F1+F2+F3**, all applied & re-verified by driving:
- **F1 (N1/S-M2)** — IPv6 all-networks wildcards `::/0` and `::` now rejected alongside
  `"*"`/`0.0.0.0/0` (trimmed, case-insensitive).
- **F2 (N2/S-L1)** — malformed IP/CIDR now throws a **keyed** `InvalidOperationException`
  naming `ForwardedHeaders:KnownProxies`/`KnownNetworks` + the offending value (via
  `TryParse`), instead of a bare `FormatException`.
- **F3 (S-M1)** — both fail-loud guards (`AppSettings:FrontendUrl`, `ConnectionStrings:TidansuDb`)
  now key off `!IsDevelopment()` (was `IsProduction()`), so **Staging / any mis-named non-dev
  env also fails loud**. Development still boots with blank values (swagger-CLI/Kiota regen
  path preserved). **Accepted tradeoff:** Staging now also requires the full prod config set.
- **S-L2** (recipient-email PII in a log line) — pre-existing, **deferred to B-8** (not this diff).

**Done bar (per Stage-1 "run now, mark E2E pending" decision):** all code-verifiable
hardening + the proof checklist are complete and verified. Three items remain recorded in
[`./proof-checklist.md`](./proof-checklist.md) as **not closeable by this sweep** (as agreed):
- **FR-2** real magic-link email delivery → ⏳ pending owner **Brevo** setup (B-4).
- **FR-3** live Stripe **test-mode** purchase end-to-end → ⏳ pending owner **Stripe** drive (B-6).
- **FR-10** real `ForwardedHeaders__KnownProxies/KnownNetworks` value + two-client-IP check →
  📋 **open deploy step** once production proxy topology is known.

**FR-12 rough edges (batched for owner review, not auto-filed):**
- CORS: the legitimately-configured origin also received no CORS header in local testing —
  flagged **non-blocking** under the single-origin decision (API + SPA same-origin), but worth
  a look if a split deploy ever appears. See `proof-checklist.md` FR-12 table.

**Changes left uncommitted** per owner choice (no branch/commit/PR opened).

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
