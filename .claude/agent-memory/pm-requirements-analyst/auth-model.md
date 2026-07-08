---
name: auth-model
description: Tidansu sign-in is passwordless magic-link; auth is NOT plan-gated and its link security properties are fixed
metadata:
  type: project
---

Tidansu authentication is passwordless: user enters email, receives a one-time
"magic link" that logs them in. Confirmed facts to reuse in any auth-adjacent
requirement:

- **Auth is NOT plan-gated.** It sits before/outside the Free/Pro model — every
  user on any plan must be able to sign in. Any auth requirement should state
  "Plan & gate: N/A". See [[plan-limits]].
- **Magic-link security (do not weaken):** single-use, **15-minute expiry**, and
  requesting a new link **supersedes** any still-active link for that email.
- Existing dev convenience: in development the email is written to a local HTML
  file (`DevelopmentEmails/*.html`), no external call; the raw link is returned in
  the request response **only in dev** — this must never reach production
  (account-takeover risk).

**Why:** These came up expanding B-4 (real production login email). They are
product invariants, not implementation detail.
**How to apply:** Reflect (don't redesign) link security in auth requirements;
mark auth work as auth-adjacent → human gate + likely security review at
implementation.
