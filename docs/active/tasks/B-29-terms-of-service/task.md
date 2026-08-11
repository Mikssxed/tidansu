---
id: B-29
slug: terms-of-service
title: Terms of Service — page, acceptance checkbox at first sign-in, and DB record of consent
status: in-review   # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: []
touch-points:          # best current guess
  - src/Tidansu.Domain/Entities/User.cs
  - src/Tidansu.Application/Auth/Commands/RequestMagicLink/*
  - src/Tidansu.Application/Auth/Commands/ConsumeMagicLink/*
  - src/Tidansu.Infrastructure/Migrations/ (new migration)
  - src/Tidansu.App/src/views/auth/LoginView.vue
  - src/Tidansu.App/src/router/index.ts
  - src/Tidansu.App/src/views/ (new TermsView)
  - docs/ (new terms-of-service content)
---

# B-29 · Terms of Service

## Description
The owner wants basic legal cover for the app. Users must accept a Terms of
Service before they can use Tidansu, and that acceptance must be recorded in the
database — versioned, per user — so there is a durable record of who agreed, to
which version, and when. Users must also be able to read the full Terms on a
dedicated, publicly reachable page, linked from sign-in and from the app itself.
A signed-in user with no acceptance recorded for the current version (new
account, pre-existing user, or after a version bump) is blocked from the rest of
the app by an acceptance modal until they accept.

## Acceptance criteria
- [ ] A Terms of Service document exists in the repo, drafted to give the owner
      reasonable legal cover for a hobby/SaaS inventory app operated from Poland,
      carrying an explicit version identifier. Company/operator-specific fields
      are clearly-marked `TODO` placeholders for the owner to fill in (company
      name, registration no., address, contact) — never invented.
- [ ] A dedicated, publicly reachable page (no auth required) renders the full
      current Terms.
- [ ] **[Gate 1 — CONFIRMED: checkbox on the email-request form.]** The
      email-request form (`LoginView.vue`) carries an "I accept the Terms of
      Service" checkbox with a link to read the Terms; the "Send me a link"
      action is disabled until it is ticked. Reading the Terms is available
      inline (modal) so the user does not lose their entered email — this is the
      "come back to login after reading" UX from the original request.
- [ ] Acceptance expressed at request time is persisted on the user when the
      account is created/session granted at `ConsumeMagicLink` (carry the
      accepted version through the magic-link so the stored record is accurate).
- [ ] Acceptance is persisted per user (by `UserId`), historically (a version
      bump adds a new acceptance record, never overwrites the prior one), with
      at minimum an accepted-at timestamp and the terms version accepted.
- [ ] The Terms page is linked from the sign-in flow, the acceptance modal, and
      the app footer/settings.
- [ ] No regression to the existing magic-link sign-in flow.

## Notes
- **Auth is passwordless / magic-link**, not password register/login. Flow is
  `RequestMagicLink` (enter email) → email link → `ConsumeMagicLink` (session
  granted, account created on first consume).
- **Gate 1 RESOLVED (product owner):** consent is a **checkbox on the
  email-request form** (option A in requirements.md), NOT the gating modal the PM
  recommended. Consequence accepted: a checkbox alone cannot re-prompt existing
  users on a version bump — the **automatic version-bump re-prompt is OUT OF
  SCOPE** for B-29. The DB record must still be **versioned** so that re-prompt
  can be added later without a migration. An inline "read the Terms" modal on the
  login form is in scope (so the user doesn't lose their entered email).
- **Gate 1 RESOLVED (product owner):** scope **includes a minimal Privacy Policy
  / GDPR data-processing note** alongside the Terms of Service (owner is in
  Poland/EU; app processes email now + payment data later). Both documents live
  in the repo with company details as TODO placeholders; both get a public page.
- Owner is in Poland; leave company/registration data as commented TODO placeholders
  rather than inventing details. Relates to [B-5] (Poland payments legal research) —
  reuse any operator facts already gathered there if present.
- This changes the auth-adjacent flow + adds a schema migration → **full pipeline
  path**; Stage 3 will hit auth + migration pause gates.

### Tech-planning notes (tech-lead)
- Tech tasks written to [`./tech-tasks.md`](./tech-tasks.md), scoped to the three
  gate decisions (checkbox on `LoginView`, version carried request→token→consume,
  ToS + Privacy each with a public page). No re-prompt (out of scope) but schema is
  versioned (append-only `TermsAcceptance` table) so it's additive later.
- **Reuse win:** `components/pricing/CheckoutConsentStep.vue` (B-6) already links
  `/legal/terms` + `/legal/privacy` as dead `href`s — B-29 creates the public pages
  at exactly those paths, lighting up those links. Do NOT invent a `/terms` namespace.
- **Human gate — SCHEMA MIGRATION (Stage-3 pause):** `dotnet ef migrations add
  AddTermsAcceptance …`. Two additive changes (new `TermsAcceptances` table + nullable
  `MagicLinkTokens.AcceptedTermsVersion`), no backfill. Review Up/Down before applying.
- **Human gate — KIOTA REGEN:** `RequestMagicLinkCommand` gains `AcceptedTermsVersion`
  → contract change → `dotnet build` API then `npm run build:api`, commit the client
  (CI `kiota-drift` enforces). `AuthResponse`/consume contract unchanged.
- **All six open questions resolved by the PO and baked into `tech-tasks.md`:**
  (1) separate append-only `TermsAcceptance` table (not `User` columns);
  (2) legal content as **static Vue components** (`LegalTermsContent.vue` /
  `LegalPrivacyContent.vue`), NO `markdown-it` — one component per doc reused by both the
  public page and the login modal; (3) no user backfill (no deployed users);
  (4) ToS states **Poland** as governing law, court/city + all company/registration/contact
  fields left as `TODO:`; (5) dual version constants, no "current legal version" endpoint;
  (6) one checkbox → single combined `TermsVersion` covering Terms + Privacy.
- **Watch-out:** `TermsPolicy.CurrentTermsVersion` (backend) and `TERMS_VERSION`
  (frontend `data/legal.ts`) must match or every login 400s (safe: SPA ships in the API's
  wwwroot). Bump them together, plus the version shown in the content components — a
  "bump together" comment goes on both constants.
- No new dependencies.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
