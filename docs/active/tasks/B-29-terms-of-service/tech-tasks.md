# B-29 · Terms of Service — Technical Tasks

> Scope is fixed by the product-owner gate decisions (do NOT re-open):
> **(1)** consent = a checkbox on the email-request form (`LoginView.vue`), "Send me
> a link" disabled until ticked, an inline modal to read the Terms without losing the
> entered email. **(2)** accepted version is captured at `RequestMagicLink`, carried on
> the magic-link token, copied to a versioned per-user record at `ConsumeMagicLink`;
> auto version-bump re-prompting is OUT OF SCOPE, but the schema stays versioned.
> **(3)** BOTH a Terms of Service AND a minimal Privacy/GDPR note, each a repo document
> with clearly-marked `TODO:` placeholders + a version identifier + a public no-auth page.
>
> **Reuse discovery:** `components/pricing/CheckoutConsentStep.vue` (B-6) already links
> `/legal/terms` and `/legal/privacy` as `href`s to routes that don't exist yet. B-29
> must create the public pages at **exactly those paths** so those existing dead links
> resolve — do not invent a new `/terms` namespace. (`/legal/withdrawal`, `/legal/imprint`
> in that file stay out of scope — tracked with the Poland payments work.)

Seam summary (deep-module terms): the consent **version** flows through three narrow
seams — the login form asserts a version → the magic-link token carries it (request→consume
bridge across the "no account yet" gap) → a `TermsAcceptance` record persists it per user.
Each seam validates the version against one authority (`TermsPolicy.CurrentTermsVersion`)
so a stale or forged version can't enter the audit trail. Rendering the legal text is a
second, independent seam: one shared presentational Vue component per document drives both
the public page and the login modal (single content source, no drift, no markdown dependency).

---

## 1. 📋 Technical Tasks

### Backend — Domain

- [x] create `src/Tidansu.Domain/Constants/TermsPolicy.cs`
  - Pure static class, the **single authority** for the current legal versions:
    `public const string CurrentTermsVersion = "2026-08-11";` and
    `public const string CurrentPrivacyVersion = "2026-08-11";` (date-based version ids).
  - Mirror the shape of `Tidansu.Domain/Constants/PlanPolicy.cs` (pure/static, no deps).
  - *Why:* the request validator (backend) and the record write both key off one constant;
    bumping the Terms later = editing this one line (FR-1/FR-8 versioning mechanism).
  - ⚠️ This value MUST stay in lock-step with the frontend `TERMS_VERSION` constant and the
    version marker in the markdown doc — see the frontend task and Open Question 4.

- [x] create `src/Tidansu.Domain/Entities/TermsAcceptance.cs`
  - Fields: `Guid Id`, `string UserId` (FK → `AspNetUsers`), `string TermsVersion`,
    `DateTime AcceptedAt`. Historical, append-only — a version bump adds a **new** row,
    never mutates the prior one (FR-6 audit trail).
  - *Why a separate entity, not two columns on `User`:* FR-6 requires a durable, historical
    per-user record that is never overwritten; a table gives history for free and makes the
    later re-prompt query (`any acceptance for CurrentTermsVersion?`) additive — no migration
    needed to turn re-prompt on (decision #2's "versioned so it can be added later without a
    migration"). See Open Question 1.

- [x] add nullable `AcceptedTermsVersion` (`string?`) to
      `src/Tidansu.Domain/Entities/MagicLinkToken.cs`
  - Carries the version the user asserted at request time across the request→consume gap
    (the account doesn't exist yet at request time). Nullable so existing outstanding tokens
    migrate cleanly and consume stays defensive if it's ever null.

- [x] create repository interface
      `src/Tidansu.Domain/Repositories/ITermsAcceptancesRepository.cs`
  - `Task<bool> ExistsAsync(string userId, string termsVersion, CancellationToken)` and
    `Task AddAsync(TermsAcceptance acceptance, CancellationToken)` (+ `SaveChangesAsync` if
    that's the local convention).
  - Mirror `Tidansu.Domain/Repositories/IMagicLinkTokensRepository.cs` (interface in Domain,
    zero EF types).

### Backend — Application

- [x] add `AcceptedTermsVersion` to
      `src/Tidansu.Application/Auth/Commands/RequestMagicLink/RequestMagicLinkCommand.cs`
  - New request field, mirror the existing `Email` property style.
  - ⚠️ **API contract change** → triggers Kiota regen (task below).

- [x] add validation rules to
      `src/Tidansu.Application/Auth/Commands/RequestMagicLink/RequestMagicLinkCommandValidator.cs`
  - `RuleFor(c => c.AcceptedTermsVersion).NotEmpty().Equal(TermsPolicy.CurrentTermsVersion)`.
  - *Why `.Equal` and not just `.NotEmpty`:* rejects a stale or forged version so only a real,
    current version can ever enter the audit record. The SPA is built into the API's `wwwroot`
    and ships with it, so the frontend constant and backend constant are always in sync at
    deploy — a mismatch means a dev-time drift bug, surfaced immediately as a clean 400.
  - ⚠️ A 400 here is independent of account existence, so it introduces **no** user-enumeration
    vector (consistent with the existing throttle design).

- [x] set the token field in
      `src/Tidansu.Application/Auth/Commands/RequestMagicLink/RequestMagicLinkCommandHandler.cs`
  - When constructing the `MagicLinkToken` (line ~40), set
    `AcceptedTermsVersion = request.AcceptedTermsVersion`. No other change.

- [x] inject the repo + write the acceptance in
      `src/Tidansu.Application/Auth/Commands/ConsumeMagicLink/ConsumeMagicLinkCommandHandler.cs`
  - Add `ITermsAcceptancesRepository termsAcceptances` to the primary constructor.
  - After the user is resolved/created (line ~35) and **before** issuing tokens: if
    `token.AcceptedTermsVersion is { } version`, and
    `!await termsAcceptances.ExistsAsync(user.Id, version, ct)`, add a `TermsAcceptance`
    (`Id = Guid.NewGuid()`, `UserId = user.Id`, `TermsVersion = version`,
    `AcceptedAt = DateTime.UtcNow`) and save.
  - *Why insert-if-absent (dedupe on `UserId`+`Version`):* every sign-in re-ticks the box and
    re-sends the version; without the guard a returning user would accumulate duplicate rows.
    Keeps the earliest genuine acceptance timestamp (FR-6).
  - ⚠️ Do not throw if the version is null/unknown — the flow must never regress the existing
    magic-link sign-in (task.md acceptance criterion "no regression").
  - ⚠️ `AuthResponse` is **unchanged** — under the checkbox model there is no re-prompt, so the
    frontend needs no terms state back. Keep the response DTO out of this change (avoids the
    B-16 "server-computed field on a shared shape" trap).

### Backend — Infrastructure

- [x] create repository impl
      `src/Tidansu.Infrastructure/Repositories/TermsAcceptancesRepository.cs`
  - Implement against `TidansuDbContext`. `ExistsAsync` = `AnyAsync(a => a.UserId == userId
    && a.TermsVersion == termsVersion)`. Mirror `Repositories/MagicLinkTokensRepository.cs`.

- [x] register the impl in
      `src/Tidansu.Infrastructure/Extensions/ServiceCollectionExtensions.cs`
  - Add the `ITermsAcceptancesRepository → TermsAcceptancesRepository` registration beside the
    other repository registrations (same lifetime as `IMagicLinkTokensRepository`).

- [x] add the entity + column to the model in
      `src/Tidansu.Infrastructure/Persistence/TidansuDbContext.cs`
  - `public DbSet<TermsAcceptance> TermsAcceptances { get; set; }`.
  - In `OnModelCreating`: configure `TermsAcceptance` — `Property(a => a.TermsVersion)
    .HasMaxLength(32)`, FK `UserId` → `User` with `OnDelete(DeleteBehavior.Cascade)` (the
    consent record dies with the account), and a **unique index** on `(UserId, TermsVersion)`
    (enforces the dedupe rule at the DB, backs `ExistsAsync`).
  - In the existing `MagicLinkToken` config block: `Property(t => t.AcceptedTermsVersion)
    .HasMaxLength(32)`.

- [x] **[SCHEMA MIGRATION — Stage-3 pause gate]** create the EF migration ✅ human-approved; `20260811161442_AddTermsAcceptance` (additive: new table + nullable column, cascade FK, unique `(UserId,TermsVersion)` index)
  - From repo root:
    `dotnet ef migrations add AddTermsAcceptance --project src/Tidansu.Infrastructure --startup-project src/Tidansu.API`
  - Covers both model changes (new `TermsAcceptances` table + new `MagicLinkTokens
    .AcceptedTermsVersion` column) in one migration.
  - ⚠️ Both changes are additive (new table, new nullable column) — no backfill. Review the
    generated `Up`/`Down` before the gate. **This is a required human pause gate.**

### Backend — API

- [x] no controller change required — verify only ✅ swagger now emits `acceptedTermsVersion` on the request body
  - `AuthController.RequestMagicLink` already binds the whole `RequestMagicLinkCommand`
    `[FromBody]`, so the new field flows through with zero controller edits. Confirm the
    swagger/OpenAPI doc now shows `acceptedTermsVersion` on the magic-link request body.

### Frontend — API client (Kiota)

- [x] **[KIOTA REGEN — required, gates the frontend]** regenerate the client ✅ clean diff: only `acceptedTermsVersion` added to `RequestMagicLinkCommand` (+ api.json, kiota-lock)
  - `dotnet build` the API (fresh swagger DLL) → from `src/Tidansu.App`: `npm run build:api`.
  - ⚠️ Do this **after** the API tasks and **before** any frontend task that sends
    `acceptedTermsVersion`. Never hand-edit `src/api/apiClient/` (a hook blocks it). CI's
    `kiota-drift` job fails the PR if the regenerated client isn't committed.
  - Confirm the generated magic-link request model now carries `acceptedTermsVersion`.

### Frontend — Legal content & data

- [x] create `src/Tidansu.App/src/data/legal.ts`
  - Export `TERMS_VERSION = '2026-08-11'` and `PRIVACY_VERSION = '2026-08-11'`.
  - ⚠️ Add a comment: `TERMS_VERSION` MUST be bumped together with the backend
    `TermsPolicy.CurrentTermsVersion` constant (and the version shown in the content components)
    or every login 400s — there is deliberately no "current legal version" endpoint (PO decision).
  - No raw markdown import — legal text lives in the Vue content components below.

- [x] create `src/Tidansu.App/src/components/legal/LegalTermsContent.vue`
  - **Presentational-only** component holding the full Terms of Service as static Vue markup
    (FR-1): service description, account/eligibility, acceptable use, user-content ownership,
    Free/Pro & billing (link out to `/pricing` — don't duplicate billing terms), termination,
    warranty disclaimer, limitation of liability, governing law, contact.
  - **Governing law:** state **Poland** as the governing law; leave the specific court/city as a
    clearly-marked `TODO:` placeholder. Every operator-specific fact (legal company name,
    registration no., registered address, contact email) is a `TODO:` placeholder — never
    invented. Reuse any operator facts already gathered in B-5 if present.
  - Renders its own title + "Version {{ version }}" header, where `version` is a `computed`
    reading `TERMS_VERSION` from `data/legal.ts` (single source; no logic in template).
  - This ONE component is the single content source reused by both the public page AND the login
    modal (FR-2 + FR-7, no drift).
  - ⚠️ `@theme` token colors only (`text-text`, `text-text-2`, `border-border`) — no hex; static
    Tailwind classes; template-purity HARD RULE. No props needed (self-contained content).

- [x] create `src/Tidansu.App/src/components/legal/LegalPrivacyContent.vue`
  - Same presentational pattern as `LegalTermsContent.vue`. Minimal GDPR/data-processing note
    (EU launch): what personal data is collected (email now; Stripe payment data later per
    B-5/B-6), purpose, retention, data-subject rights, controller identity — all operator facts
    as `TODO:` placeholders. Header shows "Version {{ version }}" from `PRIVACY_VERSION`.

### Frontend — Components/Views

- [x] create `src/Tidansu.App/src/views/legal/TermsView.vue` and
      `src/Tidansu.App/src/views/legal/PrivacyView.vue`
  - Thin public views (mirror the composition style of `views/SpaceView.vue` but far simpler):
    render `LegalTermsContent` / `LegalPrivacyContent` inside the PLAIN layout, plus a "Back"
    link. No auth, no data fetch. Loads with no session/token (FR-2).

- [x] add the two public routes in `src/Tidansu.App/src/router/index.ts`
  - Add to `AppViews`: `legalTerms: () => import('@/views/legal/TermsView.vue')`,
    `legalPrivacy: () => import('@/views/legal/PrivacyView.vue')`.
  - Add routes: `createRoute('/legal/terms', 'legalTerms', LayoutType.PLAIN, false)` and
    `createRoute('/legal/privacy', 'legalPrivacy', LayoutType.PLAIN, false)`.
  - *Why `/legal/*`:* matches the existing dead `href`s in `CheckoutConsentStep.vue` so they
    resolve. `requiresAuth: false`; NOT added to the `guestOnly` bounce list (authed users must
    be able to read them too — the current guard only bounces `login`/`landing`, so no guard edit
    needed).
  - Optionally add `TITLES` entries.

- [x] wire the checkbox + read-Terms modal into
      `src/Tidansu.App/src/views/auth/LoginView.vue`
  - Add a `termsAccepted` ref (default `false`); reset it in `useDifferentEmail`.
  - Extend `sendDisabled` computed → `!emailValid.value || sending.value || !termsAccepted.value`.
  - Add a consent-checkbox row inside the "State A — enter email" form, **mirroring the exact
    pattern in `components/pricing/CheckoutConsentStep.vue:50-62`** (label + `<input type="checkbox"
    :checked @change="onToggleTerms">`, `consentRowClass` computed for the ticked border,
    `accent-pro`). Copy: "I accept the Terms of Service and Privacy Policy." with the doc names as
    buttons that open the modal.
  - Copy: one checkbox — "I accept the Terms of Service and Privacy Policy." — records a single
    combined `TermsVersion` covering both documents (PO decision). Both doc names are buttons that
    open the read modal.
  - Add a `BaseModal` (`useModal` composable) rendering the shared `LegalTermsContent` (and/or
    `LegalPrivacyContent`) so the user reads the Terms inline **without losing the entered email**
    (FR-7 acceptance criterion). Named handlers only (`onToggleTerms`, `openTermsModal`,
    `closeTermsModal`) — no inline logic.
  - Pass the version to the request: update the `sendLink` call to
    `auth.requestMagicLink(email, returnUrl, TERMS_VERSION)`.
  - ⚠️ Template-purity HARD RULE — the checkbox row's dynamic border is a `computed` class, not a
    ternary in `:class`.

- [x] thread the version through `src/Tidansu.App/src/composables/useAuth.ts`
  - Change `requestMagicLink(email, returnUrl?, acceptedTermsVersion?)` and pass it into
    `client.api.auth.magicLink.post({ email, returnUrl: returnUrl ?? null, acceptedTermsVersion })`.
  - 🔒 blocked by: Kiota regen (the post body type must carry `acceptedTermsVersion`).

- [x] add footer/settings legal links (FR-7 discoverability)
  - In `src/Tidansu.App/src/views/AccountView.vue`: add a small "Legal" links block (RouterLinks
    to `legalTerms` / `legalPrivacy`) near the sign-out button. Named router-link `:to`, tokens only.
  - Verify the sign-in screen links the Terms too (the login modal + the checkbox doc-name buttons
    satisfy this; add a plain footer link under the form if the visual design wants a standalone one).
  - Note: the `CheckoutConsentStep.vue` `/legal/terms` + `/legal/privacy` links now resolve
    automatically once the routes exist — no edit needed there.

### Refactoring

- [ ] [refactor] none required in touched files — `CheckoutConsentStep.vue`, `LoginView.vue`,
  `AccountView.vue`, `AuthController.cs`, and the two auth handlers already follow the variant/
  template-purity/CQRS conventions. Scope stays to the files above; no unrelated refactors.
  - One watch-item (not a refactor): `LoginView.vue`'s `sendDisabled`/`sendLabel` stay computed —
    keep the new `termsAccepted` gate inside the existing computed, don't add template logic.

### Verification (feature close-out — Tidansu has no E2E suite)

- [ ] `dotnet build` green (solution) and `dotnet test tests/Tidansu.Domain.Tests` green
  - No new pure Domain rule was added (TermsPolicy is just constants; the validator/handler are
    Application, not the Domain unit-test surface), so no new xUnit test is required. Confirm the
    existing suite still passes.
- [ ] `npm run build` green (vue-tsc type-check) from `src/Tidansu.App`.
- [ ] manual end-to-end drive in the running app (`run`/`verify` skills):
  - **Public pages:** open `/legal/terms` and `/legal/privacy` **signed out** (clear session) —
    both render the doc + version, no redirect to login.
  - **Happy path:** on `/login`, confirm "Send magic link" is **disabled** until the checkbox is
    ticked; open the read-Terms modal and confirm the entered email survives closing it; tick,
    send, open the dev link, land in `/spaces`.
  - **Record:** confirm a `TermsAcceptances` row exists for the new user (version + `AcceptedAt`).
  - **Regression:** existing magic-link sign-in still works; re-signing-in the same user does NOT
    create a duplicate acceptance row (dedupe).
  - **Discoverability:** Terms/Privacy reachable from the login screen, the modal, and Account.

---

## 2. 🔒 Security Considerations

- **Forged / stale version in the audit record (integrity of legal evidence).** The accepted
  version is client-supplied; junk or an old version would corrupt the consent record's legal value.
  - [ ] Validator constrains it: `NotEmpty().Equal(TermsPolicy.CurrentTermsVersion)` +
        `HasMaxLength(32)` at the column — only a real current version can be recorded. 🟠 High
- **User-enumeration via the new required field.** A new required field must not leak account
  existence through differential responses.
  - [ ] Confirm the 400 for a bad/missing version fires identically regardless of whether the email
        maps to an account (it validates before any user lookup), preserving the existing throttle's
        non-enumeration property. 🟠 High
- **IDOR on the consent write.** The acceptance must bind to the server-resolved user, never a
  client-supplied id.
  - [ ] Confirm `ConsumeMagicLinkCommandHandler` writes `UserId = user.Id` (the user resolved from
        the burned token), never anything client-supplied. 🟡 Medium
- **Public legal pages leak nothing.** No-auth pages must render static content only.
  - [ ] Confirm `TermsView`/`PrivacyView` fetch no session/user data and work with no token. The
        legal text is static Vue markup (no `v-html`, no markdown renderer, no user input in the
        content path), so there's no injection surface. 🟢 Low

## 3. 📈 Scalability / Correctness Considerations

- **Extra query in the consume hot path.** The `ExistsAsync` dedupe check adds one query per
  sign-in.
  - [ ] Back it with the `(UserId, TermsVersion)` unique index so it's an index seek, not a scan;
        it also atomically enforces the dedupe rule if two consumes race (unique-constraint catch).
- **Consent write must not regress sign-in.** A failure/absence in the terms path must not break auth.
  - [ ] Guard on `token.AcceptedTermsVersion is { } version`; skip silently when null (defensive for
        pre-migration outstanding tokens). Sign-in never depends on the acceptance write succeeding
        beyond its own transaction.
- **Version drift between the two constants.** Backend `TermsPolicy.CurrentTermsVersion` and
  frontend `TERMS_VERSION` must match or every login 400s (PO chose dual constants, no endpoint).
  - [ ] They ship together (SPA built into API `wwwroot`); add a "bump together" comment on both
        constants and the "bump both + the version shown in the content components" rule to
        `task.md` Notes.

## 4. 📦 New Dependencies

No new dependencies required. Legal content is authored as static Vue components
(`LegalTermsContent.vue` / `LegalPrivacyContent.vue`) — no markdown renderer (PO decision).

## 5. ❓ Open Questions

No open questions — all six resolved by the product owner and baked into the tasks above:
append-only `TermsAcceptance` table · static Vue content components, no `markdown-it` · no user
backfill (no deployed users) · Poland governing law with court/city + company fields as `TODO:` ·
dual version constants (no endpoint), bump together · one checkbox recording a single combined
`TermsVersion` covering both the Terms and the Privacy Policy.
```
