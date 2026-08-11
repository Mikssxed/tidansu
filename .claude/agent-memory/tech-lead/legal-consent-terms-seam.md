---
name: legal-consent-terms-seam
description: B-29 ToS/consent design — version seam request→token→consume, append-only TermsAcceptance, /legal/* namespace, dual-constant version sync
metadata:
  type: project
---

Terms-of-Service / consent capture (B-29) design decisions.

**Why:** passwordless magic-link means no account exists at consent time
(`RequestMagicLink`) — only at `ConsumeMagicLink`. Consent version must bridge that gap.

**How to apply:**
- Consent version flows through three narrow seams, each validating against ONE
  authority `TermsPolicy.CurrentTermsVersion` (Domain constant): login form asserts →
  `MagicLinkToken.AcceptedTermsVersion` (nullable) carries it → `ConsumeMagicLink`
  copies it to a `TermsAcceptance` row. Validator uses `.NotEmpty().Equal(current)` so
  stale/forged versions can't enter the audit trail.
- Consent record is a **separate append-only `TermsAcceptance` entity**
  (Id, UserId FK, TermsVersion, AcceptedAt), NOT columns on `User` — FR-6 wants history,
  and re-prompt (out of scope) becomes an additive query later, no migration. Dedupe via
  unique index `(UserId, TermsVersion)`, insert-if-absent in the consume handler.
- Consume must never regress sign-in: guard `token.AcceptedTermsVersion is { } v`, skip
  silently if null. `AuthResponse` stays unchanged (no re-prompt → frontend needs nothing back).
- **Public legal pages live at `/legal/terms` + `/legal/privacy`** (NOT `/terms`) —
  `components/pricing/CheckoutConsentStep.vue` (B-6) already links those exact paths as
  dead hrefs (plus `/legal/withdrawal`, `/legal/imprint` for later). Reuse the namespace.
- **Version dual-constant trap:** backend `TermsPolicy.CurrentTermsVersion` and frontend
  `TERMS_VERSION` (`src/data/legal.ts`) must match or every login 400s. Safe because the
  SPA builds into the API's wwwroot (ships together). Bumping terms = both constants + the
  markdown doc version marker. See [[email-magic-link-delivery-seam]].
- Legal content = static Vue components `LegalTermsContent.vue` / `LegalPrivacyContent.vue`
  (PO rejected markdown-it), one component per doc reused by both the public `/legal/*` page
  and the login read-modal (single source, no drift, no v-html/injection surface). ToS states
  Poland governing law; court/city + all company/registration/contact fields are `TODO:`.
