# Code Review: B-29 Terms of Service

**Date**: 2026-08-11
**Reviewer**: branch-code-reviewer agent
**Diff base**: origin/main (changes uncommitted on `main`)
**Files changed**: ~26 product files (backend CQRS/EF + migration, frontend legal
components/views, LoginView/AccountView, regenerated Kiota client) + task docs
**Scope of this pass**: correctness, convention adherence, scope-creep, spec-match.
Trust / fail-open / secret-leak is being audited in parallel by the security-reviewer
and is intentionally not re-derived here.

## Summary
A clean, spec-faithful implementation. All six locked gate decisions are honored:
checkbox-on-form consent, append-only versioned `TermsAcceptance`, static Vue legal
markup (no markdown dependency), dual version constants that match, one combined
checkbox recording a single `TermsVersion`, and no auto re-prompt. Template purity,
`@theme`-token styling, and CQRS layering are all respected; TODO placeholders are
correctly left un-invented. One Major worth guarding before merge: the new unique
index can surface an unhandled `DbUpdateException` (HTTP 500) on a concurrent
same-token consume, which the tech-task text wrongly assumed was handled gracefully.

## 🔴 Critical (must fix before merge)
None.

## 🟠 Major (strongly recommended)

### [M1] Unique-index violation on concurrent consume is unhandled → 500 on the sign-in hot path
**File**: `src/Tidansu.Application/Auth/Commands/ConsumeMagicLink/ConsumeMagicLinkCommandHandler.cs:42-53`
**Category**: Correctness / Functional ("no regression to sign-in")
**Description**: The dedupe is check-then-insert (`ExistsAsync` → `AddAsync`) backed by
a `(UserId, TermsVersion)` unique index. The tech-task claims the unique constraint
"beats a check-then-insert TOCTOU" — but there is **no catch** around the insert, so a
constraint violation propagates as a `DbUpdateException` and is mapped to a 500 by
`ErrorHandlingMiddleware`, failing an otherwise-valid sign-in. Reachability is narrowed
by magic-link supersession (`RequestMagicLinkCommandHandler.cs:36` invalidates prior
tokens, so only one token is ever active), leaving one live window: a **concurrent
double-consume of the same token** (e.g. the magic-link URL opened/prefetched twice).
The token burn at line 29-30 is a separate `SaveChanges`, so two racing requests can
both pass `token.IsActive`, both see `ExistsAsync == false`, and both attempt the
insert — one wins, the other 500s. Because the token is already burned, the user's
retry also fails. This directly contradicts the "no regression to the existing
magic-link sign-in flow" acceptance criterion, and the fix is small.
**Recommendation**: Make the acceptance write best-effort — wrap the insert in a
`try { … } catch (DbUpdateException) { /* already recorded by a racing consume */ }`,
or catch it and continue. The consent record's earliest genuine row is preserved and
sign-in never fails over the terms path. (This overlaps the security-reviewer's
fail-open angle; flagging it here for the correctness/no-regression contract.)

## 🟡 Minor (nice-to-have)

### [N1] Redundant second `SaveChangesAsync` after `AddAsync`
**File**: `src/Tidansu.Application/Auth/Commands/ConsumeMagicLink/ConsumeMagicLinkCommandHandler.cs:51-52`
**Category**: Correctness (dead call)
**Description**: `TermsAcceptancesRepository.AddAsync` already calls `SaveChangesAsync`
internally (`TermsAcceptancesRepository.cs:13-17`, matching `MagicLinkTokensRepository`).
The handler then calls `termsAcceptances.SaveChangesAsync(...)` again on line 52, which
has no pending changes and is a no-op. Harmless but misleading — it reads as though two
writes are intended. The `ITermsAcceptancesRepository.SaveChangesAsync` member is also
unused anywhere after this.
**Recommendation**: Drop the explicit `SaveChangesAsync` call on line 52 (and optionally
the now-unused interface member), or, if you prefer explicit saves, change `AddAsync` to
`Add`-only and keep the explicit save — but don't do both.

### [N2] `useAuth.requestMagicLink` accepts `acceptedTermsVersion?` as optional
**File**: `src/Tidansu.App/src/composables/useAuth.ts:20-31`
**Category**: Correctness (latent footgun)
**Description**: The param is optional and the Kiota model marks `acceptedTermsVersion`
optional/nullable (Kiota default), but the backend command field is `required` and the
validator enforces `.NotEmpty().Equal(...)`. The sole caller (`LoginView.vue:266`) always
passes `TERMS_VERSION`, so this is fine today; a future caller omitting it would get an
opaque 400. Not worth changing behavior, just noting the type says "optional" while the
contract is "required".
**Recommendation**: Optional — make the `acceptedTermsVersion` parameter required in the
composable signature to mirror the backend contract, so the type system catches an
omitting caller.

## 🟢 Nit

### [Nit1] "Version X · Last updated X" both read the same constant
**File**: `components/legal/LegalTermsContent.vue:185-186`, `LegalPrivacyContent.vue:155-156`
`version` and `lastUpdated` are both computed from the same date-based version constant,
so the header renders the same value twice under two labels. It reads acceptably because
the version *is* a date, but `lastUpdated` carries no independent information. Consider
dropping it or sourcing a real last-updated date if the two ever diverge.

## 🧭 Convention Violations (project rules)
None found. Specifically verified:
- **Template purity** — every dynamic class in `LoginView.vue` (`consentRowClass`,
  `termsTabClass`, `privacyTabClass`, `sendDisabled`, `sendLabel`, `isTermsDocActive`)
  is a `computed`; every handler (`onToggleTerms`, `openTermsModal`, `openPrivacyModal`,
  `showTermsDoc`, `showPrivacyDoc`, `closeLegalModal`) is named. No ternaries/concatenation/
  inline arrows in any template. ✔
- **`@theme` tokens only** — legal content, views, LoginView consent row and
  AccountView legal block use `text-text`/`text-text-2`/`text-text-3`/`border-border`/
  `bg-surface-*`/`warn`/`accent-pro`/`pro`. No hardcoded hex. (Bracketed `text-[13px]`,
  `max-w-[720px]`, `p-[calc(26px*var(--pad))]` are pixel/size values, not color tokens —
  consistent with the existing files they mirror; not a violation.) ✔
- **Static Tailwind classes** — no dynamic `` `bg-${x}` `` anywhere. ✔
- **CQRS / layer discipline** — repo interface in Domain, impl in Infrastructure, DI in
  `ServiceCollectionExtensions`; no EF types in Application/Domain; handler throws no HTTP.
  Validator uses `TermsPolicy.CurrentTermsVersion` as the single authority. ✔
- **Kiota** — `models/index.ts` regenerated (not hand-edited); diff is exactly the added
  `acceptedTermsVersion` field on `RequestMagicLinkCommand` plus its serialize/deserialize
  entries, matching the contract change. ✔

## 🏗️ Architecture Notes
- **Version-constant parity confirmed**: backend `TermsPolicy.CurrentTermsVersion` /
  `CurrentPrivacyVersion` = `"2026-08-11"` and frontend `TERMS_VERSION` / `PRIVACY_VERSION`
  = `'2026-08-11'` — no drift. Both constants carry the "bump together" comment as
  specified, and the content components render the value from the same constants. Good.
- **Migration ↔ model parity confirmed**: `20260811161442_AddTermsAcceptance` is additive
  (nullable `MagicLinkTokens.AcceptedTermsVersion nvarchar(32)`, new `TermsAcceptances`
  table, cascade FK to `AspNetUsers`, unique `(UserId, TermsVersion)` index). It matches
  `TidansuDbContext.OnModelCreating` and the snapshot exactly. `Down` is a clean reverse
  (drop table + drop column); non-destructive to existing data. No backfill needed (no
  deployed users). ✔
- **Seam integrity**: version flows login-form → validated at request → carried on the
  token → recorded at consume, validated against one authority at the request seam. The
  `required` keyword on `AcceptedTermsVersion` also rejects an omitting client at
  deserialization before FluentValidation — belt-and-suspenders, fine.
- **Scope**: no scope-creep. Every change maps to a `tech-tasks.md` item. The two
  `.claude/agent-memory/*` edits are agent artifacts, not product code.
- **Reuse landed as planned**: the two `/legal/*` routes light up the previously-dead
  `href`s in `CheckoutConsentStep.vue`; no new `/terms` namespace was invented.

## 👍 Positives
- Legal content is genuinely careful: Poland governing law stated, every operator-specific
  fact (`legal entity`, `KRS/NIP/REGON`, address, contact, court/city, DPO) left as a
  clearly-marked `[TODO:]` placeholder — none invented — plus an honest "pending lawyer
  review" banner. UODO named correctly (a public authority, not an operator fact).
- Single shared content component per document drives both the public page and the login
  modal — no drift, no `v-html`, no markdown dependency (matches gate decision 2).
- Consent checkbox row faithfully mirrors the `CheckoutConsentStep` pattern; the read
  modal preserves the entered email (the exact FR-7 "come back after reading" UX).
- Handler comments correctly document the insert-if-absent intent and the null-defensive
  guard (`token.AcceptedTermsVersion is { } version`) that protects pre-migration tokens.

## Action Checklist
- [ ] [M1] Wrap the `TermsAcceptance` insert in `try/catch (DbUpdateException)` so a racing
      concurrent consume can't 500 a valid sign-in.
- [ ] [N1] Remove the redundant second `SaveChangesAsync` (and optionally the now-unused
      interface member) in `ConsumeMagicLinkCommandHandler`.
- [ ] [N2] (Optional) Make `acceptedTermsVersion` a required param in
      `useAuth.requestMagicLink` to mirror the backend contract.
- [ ] [Nit1] (Optional) Drop or independently source `lastUpdated` in the legal content
      components.

---

## Resolution (orchestrator, human-approved)

**[M1] / [S-H1] — consent write could 500 a valid sign-in — FIXED.**
- `ConsumeMagicLinkCommandHandler`: the consent write was extracted into a
  `RecordTermsAcceptanceAsync` helper that runs **after** access/refresh tokens are
  issued and **swallows any exception** (logs a warning) — a best-effort audit write
  can no longer deny an otherwise-valid sign-in.
- `TermsAcceptancesRepository.AddAsync`: now catches `DbUpdateException` from the
  `(UserId, TermsVersion)` unique index and treats the concurrent-double-consume
  collision as **idempotent success** (detaches the rejected entry).
- Verified: `dotnet build` green. Happy-path behavior unchanged (same insert-if-absent);
  only ordering + failure isolation changed.

**Deferred (not blocking) — filed as follow-ups, not fixed here:**
- Cascade-delete FK on `TermsAcceptance` would erase consent evidence if a
  user-deletion path is ever added (none exists today; GDPR-relevant either way).
- Pre-existing non-atomic magic-link token burn (predates B-29).
