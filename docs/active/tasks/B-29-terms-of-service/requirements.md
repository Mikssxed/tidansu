### 📋 Backlog Item
Give the Tidansu owner (operating from Poland) basic legal cover by publishing a
Terms of Service, requiring every user to explicitly accept it before using the
app, recording that acceptance durably per user, and re-prompting when the terms
change.

### 🎯 Product Context Summary
This is a legal/trust requirement that sits **outside** the Free/Pro model —
like sign-in itself, every user on every plan must accept, and acceptance is not
a paywalled capability. It intersects auth in one specific way: Tidansu's sign-in
is **passwordless magic-link**, so "accepting terms at sign-up" cannot reuse a
classic password-registration form pattern — there is an email round-trip between
"user expresses intent to sign in" (`RequestMagicLink`) and "account actually
exists" (`ConsumeMagicLink`, which silently creates the account on first use).
Consent capture has to be designed around that gap, not against it. The owner
being EU-based also means a bare ToS may be legally incomplete without a companion
data-processing notice — flagged below as an explicit open question, not assumed.

### 🔑 Core Functional Areas
- Terms of Service content, versioning, and a public reading page
- Consent capture at first sign-in (new-account path)
- Consent re-prompt for already-authenticated users (existing account without a
  recorded acceptance, or after a terms version bump)
- Durable, per-user, versioned consent record
- Discoverability (links from sign-in, footer/settings)
- Terms-version bump as an ongoing operational capability
- (Open question, not committed) minimal Privacy Policy / data-processing note

---

### Functional Requirements

**Terms document & public page**

- **FR-1**: A Terms of Service document must exist as real content (not
  placeholder lorem ipsum), covering the standard clauses appropriate for a
  hobby-scale SaaS inventory app operated from Poland: service description,
  account/eligibility, acceptable use, user content ownership, Free/Pro plan and
  billing reference (link out to pricing, don't duplicate billing terms in
  detail), termination, disclaimer of warranty, limitation of liability,
  governing law, and a contact point. Operator-identifying facts the agent
  cannot know (legal company name, registration number, registered address,
  contact email/address, governing-law jurisdiction detail beyond "Poland") are
  left as clearly-marked `TODO:` placeholders for the owner to fill in before
  launch — never invented.
  - *Business rationale*: This is the actual legal cover the task exists to
    provide; without real clauses a "Terms of Service" is theater.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A — applies identically to Free and Pro users.
  - *Constraints/Rules*: The document carries an explicit **version identifier**
    (e.g. a date or integer) from day one, even though only one version exists
    at launch — this is what later re-prompt logic keys off.
  - *Acceptance criteria*: The document exists in the repo with real clause text
    and a version marker; every operator-specific field is a visibly-flagged
    `TODO` rather than invented data; a human (the owner) can locate every TODO
    by searching the document once.

- **FR-2**: Anyone — signed in or not — can reach a dedicated Terms page and read
  the full current version.
  - *Business rationale*: Legal enforceability of "you agreed to the Terms"
    depends on the Terms having been genuinely readable at the time of
    agreement, and this is also required for pre-signup due diligence.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A. No authentication required to view.
  - *Constraints/Rules*: The page renders the current version only (Phase 1);
    it does not need a version-history archive.
  - *Acceptance criteria*: The page loads with no session/token, shows the
    rendered Terms and the version identifier, and works for a user who has
    never entered an email.

**Consent capture — first sign-in (new account)**

- **FR-3**: A user who has never accepted the current Terms cannot reach any
  authenticated area of the app (spaces, zones, items, account, pricing actions)
  until they explicitly accept.
  - *Business rationale*: This is the actual legal-cover mechanism — "we showed
    them the door but they never had to say yes" doesn't hold up.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: Acceptance must be an affirmative, explicit action
    (checked checkbox / confirmed modal) — never a pre-checked box, never
    implied by continuing to use the app.
  - *Acceptance criteria*: A brand-new user who completes the magic-link flow
    without accepting cannot view spaces/items; once they accept, they land in
    the app as normal. A user cannot submit acceptance without the checkbox
    checked.

- **FR-4 (see recommendation below)**: The exact moment consent is captured in
  the passwordless flow — request-email step vs. immediately after the link is
  consumed vs. a gating screen on first app entry — is decided per the "Consent
  capture point" analysis below and confirmed by the product owner before
  tech-planning.
  - *Business rationale*: The passwordless flow's email round-trip means "at
    sign-up" is ambiguous by default; picking wrong either adds friction to the
    one-click magic-link experience or creates a window where a User row exists
    with no consent on file.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: see analysis + recommendation below.
  - *Acceptance criteria*: see analysis + recommendation below.

**Consent capture point — options and recommendation**

The magic-link flow has three points where a "must accept" UI could sit:

- **Option A — checkbox on the `RequestMagicLink` (enter-email) form.** The
  checkbox must be checked before "Send magic link" is enabled. Consent intent
  is captured before any account exists, matches the literal wording "accept
  before an account is created," and adds no extra step after the user clicks
  the emailed link (today that click signs them straight in). Downside: this
  step never runs again for a *returning*, already-authenticated user, so it
  cannot by itself cover the version-bump re-prompt case (FR-5 below still
  needs its own mechanism) — a returning user with a valid session doesn't pass
  through the request-email form.

- **Option B — a forced interstitial immediately after `ConsumeMagicLink`,
  before the user is routed anywhere else.** Cleanest data story (the User row
  and the acceptance record are created together), but adds a click to what is
  today a zero-extra-step "click the email link and land in the app" flow, and
  is functionally identical to Option C except it can never be deferred.

- **Option C — a gating check on entry to any authenticated route:** if the
  signed-in user's account has no acceptance recorded for the current Terms
  version, block navigation and show an acceptance modal before letting them
  continue to their spaces. This single mechanism naturally covers **both**
  cases the task needs: a brand-new account (always lands here with no
  acceptance recorded) and a returning/pre-existing user after a version bump
  (their old acceptance no longer matches the current version). One UI, one
  "record acceptance" action, reused everywhere authentication already reused
  reused Vue Router guard.

**Recommendation: Option C**, used as the *sole* consent-capture surface (drop
Option A's checkbox from the email-request form). Rationale: it is the only
option that also satisfies FR-5 (re-prompt) without a second, separately-tested
code path; it keeps the one-click magic-link experience intact for returning
users who've already accepted; and the small window where a User row exists
before acceptance is recorded is not user-visible or functionally meaningful —
no protected data or capability is reachable until they accept, which is what
"must accept before using the app" is actually protecting. This is a deviation
from the literal "before an account is created" phrasing in `task.md`'s original
acceptance criteria, so it is called out explicitly in Open Questions for the
product owner to confirm or override before tech-planning.

**Consent re-prompt — version bump & pre-existing users**

- **FR-5**: A signed-in user whose account has no acceptance on file for the
  currently-published Terms version (either because they signed up before Terms
  existed, or because the Terms were revised since they last accepted) is shown
  a blocking acceptance modal the next time they open the app, before any other
  authenticated screen, and can continue once they accept.
  - *Business rationale*: This is what makes the versioning meaningful — a
    revised Terms document is only worth anything if re-consent is enforced,
    not just offered.
  - *Priority*: Phase 1 (Core) — required by the backlog item, not deferrable,
    since it's the mechanism that makes future version bumps legally meaningful.
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: The modal cannot be dismissed/skipped by navigating
    away, refreshing, or using the back button — every authenticated route
    re-checks acceptance state via the same router guard used for the
    `requiresAuth` check.
  - *Acceptance criteria*: A user seeded with an acceptance for an older terms
    version sees the modal on next app entry and is blocked from spaces/items
    until they accept the current version; a user who already accepted the
    current version sees no modal.

**Consent record**

- **FR-6**: Every accepted Terms is recorded per user with, at minimum, the
  terms version accepted and the timestamp of acceptance.
  - *Business rationale*: This is the actual "durable record of who agreed and
    when" the legal cover depends on — without it, "the user accepted" is
    unprovable.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: A user may have accepted multiple historical versions
    over time (each version bump adds a new acceptance, not a mutation of the
    old one) — this preserves an audit trail rather than only "latest accepted."
    The record is tied to the account (`UserId`), never to the email alone, so
    it survives independent of any single magic-link token.
  - *Acceptance criteria*: After a user accepts, a record exists showing which
    version they accepted and when; if the version is bumped and they accept
    again, the prior acceptance record is still present (not overwritten).

**Discoverability**

- **FR-7**: The Terms page is linked from the sign-in screen (visible before the
  user ever accepts, so they can read the full text before agreeing — not just
  see the checkbox copy) and from the authenticated app's footer or account/
  settings area.
  - *Business rationale*: A checkbox that says "I agree to the Terms" without a
    reachable link to read them undermines the legal value of the acceptance.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: The link opens/leads to the same public Terms page
    from FR-2 — no separate embedded copy that can drift out of sync.
  - *Acceptance criteria*: From the sign-in screen and from the acceptance
    modal itself, a user can reach the full Terms page in one action, in a way
    that doesn't lose their in-progress sign-in/acceptance state (e.g. opens in
    a new tab, or a route that returns them to where they were).

**Operational: publishing a new Terms version**

- **FR-8**: The owner can publish a revised Terms document as a new version,
  which then triggers the re-prompt (FR-5) for every existing user on their
  next app entry.
  - *Business rationale*: Terms will need to change (pricing changes, new
    features, legal review) and the whole point of versioning is that this is
    a routine, low-ceremony action, not a one-off migration each time.
  - *Priority*: Phase 2 (Growth) — the *mechanism* (FR-5/FR-6 versioning) must
    exist in Phase 1, but a polished "publish a new version" workflow can be a
    manual/ops-level action at launch (e.g. editing the document and bumping a
    version marker) rather than a built admin UI.
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: None beyond what FR-1/FR-5 already require.
  - *Acceptance criteria*: Bumping the version identifier and republishing the
    document is sufficient, on its own, to make every existing user see the
    FR-5 modal on next entry — no other manual per-user step needed.

---

### ⚠️ Key Business Considerations
- **Legal validity depends on genuine friction.** A pre-checked box, an
  auto-dismissing modal, or acceptance implied by continued use would undermine
  the entire point of this task — the acceptance must require a real, logged
  action.
- **Don't block existing users unnecessarily.** FR-5's re-prompt should trigger
  only on an actual version change or missing record — never re-show the modal
  to someone who already accepted the current version, or trust erodes fast.
- **No invented legal/company facts.** Every operator-identifying detail is a
  `TODO` for the owner; the agent must not fabricate a company name, address, or
  registration number to make the document look "complete."
- **This does not replace real legal review.** The document is a good-faith,
  reasonable-effort ToS for a hobby/early-stage SaaS — it is not a substitute
  for the owner having it checked by a Polish lawyer before scaling.

### 🚫 Out of Scope (Phase 1)
- A built admin UI for authoring/publishing new Terms versions (FR-8 covered
  manually at launch).
- Terms version history page / diff view for end users.
- Per-clause granular consent (e.g. separately opting in/out of marketing
  emails) — this task is a single "I agree to the Terms" gate.
- A full Privacy Policy (pending the open question below) beyond whatever
  minimal note the product owner decides is needed for EU launch.
- Localization of the Terms document into Polish or other languages.

### ❓ Open Questions for Product Owner
1. **Consent-capture point.** This document recommends **Option C** — a single
   gating modal on entry to any authenticated route, covering both first-time
   acceptance and version-bump re-prompt — and explicitly *not* adding a
   checkbox to the `RequestMagicLink` (enter-email) form. This diverges from
   `task.md`'s literal "checkbox... before an account is created" wording.
   Please confirm Option C is acceptable, or direct a different option (A/B/
   hybrid) — this materially changes what the tech-lead scopes.
2. **Privacy Policy / data-processing note scope.** The owner is in Poland/EU
   and Tidansu processes personal data (email addresses at minimum, later
   payment data via Stripe per B-5/B-6). Is a bare Terms of Service sufficient
   legal cover for this launch, or should this task (or a follow-up) also
   include a minimal Privacy Policy / GDPR data-processing notice covering what
   personal data is collected, why, and for how long? This materially affects
   legal exposure and is explicitly not assumed either way here.
3. **Governing law / jurisdiction clause wording.** Confirm "Poland" is the
   correct governing-law jurisdiction to state (vs. leaving it as a TODO
   pending the legal-entity decision referenced in the Poland/B-5 research).
4. **Pre-existing/dev/seed users.** Are there already real user accounts in any
   deployed environment that will need to pass through the FR-5 re-prompt on
   next login, or is this launching before any real users exist (simplifying
   the rollout to "every user's first login is the FR-3 first-time path")?
