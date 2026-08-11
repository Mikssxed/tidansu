---
name: terms-of-service-b29
description: B-29 ToS consent-capture design decision for the passwordless magic-link flow + open legal-scope questions
metadata:
  type: project
---

B-29 (Terms of Service) requirements recommend a **single gating modal on entry
to any authenticated route** as the sole consent-capture mechanism — not a
checkbox on the `RequestMagicLink` (enter-email) form. Reasoning: Tidansu's
passwordless flow (see [[auth-model]]) separates "user expresses intent to sign
in" from "account actually exists" by an email round-trip, and a returning user
never passes through the request-email form again — so only a router-guard-style
gate checked on every authenticated route naturally covers both first-time
acceptance *and* the version-bump re-prompt with one code path. This is a
deliberate deviation from the task brief's literal "checkbox before account
created" wording, called out as Open Question 1 for the product owner.

Consent records are per-`UserId` (never per-email), historical (each version
bump adds a new acceptance row, never overwrites), carrying at minimum
accepted-at timestamp + terms version.

**Open, unresolved as of 2026-08-11 (B-29 requirements stage):**
- Whether a bare ToS is enough legal cover for the EU/Poland launch or a minimal
  Privacy Policy / GDPR data-processing note is also needed — not assumed,
  flagged for the product owner. See [[eu-poland-launch]].
- Governing-law jurisdiction wording depends on the still-unsettled legal-entity
  decision from B-5.

**Why:** Captured so a follow-up Privacy Policy task or the B-29 tech-planning
stage doesn't re-litigate the consent-capture-point analysis from scratch.
**How to apply:** Reuse the Option A/B/C framing (request-form checkbox vs.
forced post-consume interstitial vs. gating modal) verbatim if this pattern
recurs for any other "must agree before use" gate in the passwordless flow.
