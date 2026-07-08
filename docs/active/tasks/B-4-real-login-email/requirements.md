# B-4 · Real login email for production — Functional Requirements

_Author: pm-requirements-analyst · Date: 2026-07-08 · Status: requirements_

### 📋 Backlog Item
Wire a real transactional email provider so that in a deployed/production
environment the magic-link sign-in email is genuinely delivered to the user's
inbox, while local development keeps writing the email to a file with no external
calls.

### 🎯 Product Context Summary
Sign-in to Tidansu is passwordless: the user enters their email and receives a
one-time, short-lived "magic link" that logs them in. Today that email is only
ever written to a local HTML file in development, and no production email path
actually delivers — so on a deployed build, real users request a link and it
never arrives, making the app unusable to anyone outside a developer's machine.
This item closes the single hardest blocker on the path to a real launch: making
sign-in work for real people. **Plan-gating is not applicable** — authentication
sits before and outside the Free/Pro model; every user, on any plan, must be able
to sign in. This is **auth-adjacent**: it touches the credential-delivery path,
so it will pass a human gate before implementation and warrant a security review
at merge time.

### 🔑 Core Functional Areas
- Real delivery of the sign-in email in production (the core gap).
- Preserving the dev experience (file, no external calls, raw-link convenience).
- Keeping the dev-only conveniences from ever reaching production.
- Operator configuration of the email provider via secrets, never source.
- Failing safely and diagnosably when email is misconfigured or delivery fails.
- Reflecting (not changing) the existing link security: single-use, short expiry.
- What the user experiences when the email is slow, lands in spam, or never comes.

---

### Functional Requirements

**Real production delivery**

- **FR-1**: In a production / prod-like environment, when a user requests a
  sign-in link, the system sends a real email to that address through a
  configured transactional email provider, containing the working magic link.
  - *Business rationale*: Without this, a deployed Tidansu cannot sign anyone in;
    it is the gating blocker to having real users at all.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A — authentication is not plan-gated; applies to all users.
  - *Constraints/Rules*: The link, expiry (15 minutes) and single-use behaviour
    are unchanged from what exists today — this item changes *delivery*, not the
    token. The email is sent to whatever address the user entered; no change to
    who is eligible.
  - *Acceptance criteria*: On a prod-like configuration, requesting a link results
    in a real email arriving in the recipient's inbox; clicking the link within
    its lifetime signs the user in and lands them in the app.

- **FR-2**: Delivery in production is best-effort and reliable enough that the
  common case ("I asked for a link, it arrived") works without manual
  intervention, and a delivery failure is recorded so an operator can see it.
  - *Business rationale*: A sign-in email that silently fails locks users out with
    no recourse and erodes trust in the product from the very first interaction.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: When the provider rejects or fails to accept the message,
    the failure must be logged clearly enough to diagnose (which address, what
    error) **without** writing the magic link or any provider secret into the log.
    A failure to deliver must not crash the sign-in request handling.
  - *Acceptance criteria*: A simulated provider failure produces a clear
    operator-visible log entry; no secret or full magic link appears in that log;
    the request completes without an unhandled error.

**Dev experience preserved**

- **FR-3**: In development the behaviour is unchanged — the email is written to a
  local HTML file and **no external call is made** to any email provider.
  - *Business rationale*: Developers must be able to run and test sign-in offline,
    with zero risk of emailing real inboxes or needing provider credentials.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: The dev file-write path stays exactly as today
    (`DevelopmentEmails/*.html`). Dev must never require a real provider key to
    boot or to exercise sign-in.
  - *Acceptance criteria*: In a development run, requesting a link writes an HTML
    file locally and makes no outbound network call to an email provider; sign-in
    still works via the file's link.

- **FR-4**: The development convenience of returning the raw magic link directly
  in the request response is **never exposed in production**.
  - *Business rationale*: Returning the raw sign-in link in the API response would
    let anyone who can call the endpoint bypass the email entirely and take over
    an account — a critical account-takeover hole if it leaked to production.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: In production the response never contains the link or the
    token; the only way to obtain the link is via the delivered email. This must
    hold regardless of provider choice or configuration.
  - *Acceptance criteria*: In a prod-like configuration, the sign-in request
    response contains no magic link and no token; only the email carries it.

**Operator configuration & secrets**

- **FR-5**: All provider credentials and connection settings are supplied by the
  operator through environment/secrets configuration, never committed to source.
  - *Business rationale*: Credentials in source are a security breach waiting to
    happen and cannot be rotated per-environment; the product must ship without
    embedded secrets.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: Sender identity (from-name/from-address) and provider
    keys are configuration, not code. No real key is present in the repository or
    default config. The same build runs in any environment purely by changing
    configuration.
  - *Acceptance criteria*: The shipped code and default config contain no live
    credentials; supplying provider settings via environment enables real
    delivery without a code change.

- **FR-6**: If the production email path is misconfigured (missing/invalid
  credentials, unreachable provider), the failure surfaces clearly and safely —
  it does not appear to succeed, and it does not expose secrets.
  - *Business rationale*: An operator deploying to a new environment must be able
    to tell immediately that email isn't set up, rather than discovering it when
    users can't log in.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: Misconfiguration is diagnosable from logs/errors and never
    prints the secret. A misconfigured environment must not silently write to a
    file or otherwise pretend it delivered.
  - *Acceptance criteria*: With deliberately missing provider config in a prod-like
    run, the operator gets a clear diagnostic and delivery is reported as failed,
    not as success.

**Link security (reflect existing, do not weaken)**

- **FR-7**: The delivered email preserves the current security properties of the
  sign-in link: it is single-use and expires after 15 minutes, and the email
  copy communicates this to the user.
  - *Business rationale*: A sign-in link is a bearer credential; short expiry and
    single-use limit the blast radius if an inbox is briefly compromised or a link
    is forwarded.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: This item must not lengthen expiry, allow reuse, or
    otherwise weaken the link. Requesting a new link supersedes any still-active
    link for that address (existing behaviour, keep it).
  - *Acceptance criteria*: A delivered link works once and only within 15 minutes;
    a used or expired link is rejected; the email text states the one-time,
    15-minute nature.

**User experience when email is slow or missing** _(deferred hardening)_

- **FR-8**: When a user has requested a link, the app tells them to check their
  email and offers a way to try again if it hasn't arrived.
  - *Business rationale*: Real inboxes delay and filter to spam; a user who sees
    only "check your email" and nothing arrives will assume the app is broken.
  - *Priority*: Phase 2 (Growth)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: A "resend" must not weaken security — re-requesting
    supersedes the prior link, and requests should be reasonably throttled to
    prevent abuse/mailbombing. Wording stays enumeration-safe (does not reveal
    whether an address has an account).
  - *Acceptance criteria*: After requesting a link the user sees clear "check your
    email" guidance and can request another; repeated requests don't stack usable
    links.

- **FR-9**: Improve deliverability so sign-in emails reliably reach the inbox
  rather than spam (sender-domain authentication, reputable sending identity).
  - *Business rationale*: A link that lands in spam is, for most users,
    indistinguishable from no link at all.
  - *Priority*: Phase 2 (Growth)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: Operational/domain configuration (e.g. authenticated
    sending domain) rather than product behaviour; documented for the operator.
  - *Acceptance criteria*: Test sends from the launch domain arrive in inbox for
    common providers, not spam.

- **FR-10**: Add resilience and observability around delivery — retry on transient
  provider errors and monitor delivery success/bounce rates.
  - *Business rationale*: At launch scale, transient provider blips shouldn't lock
    users out, and the operator needs to know if deliverability degrades.
  - *Priority*: Phase 3 (Later)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: Retries must still respect the link's 15-minute lifetime
    (a retry after expiry is pointless). Monitoring must not log link contents.
  - *Acceptance criteria*: A transient failure is retried and can still deliver a
    usable link; delivery/bounce metrics are visible to the operator.

- **FR-11**: Branded, polished email template (visual identity, plain-text
  alternative, localisation-ready copy).
  - *Business rationale*: The sign-in email is often the user's first branded
    touchpoint; a polished, trustworthy email reduces "is this phishing?" drop-off.
  - *Priority*: Phase 3 (Later)
  - *Plan & gate*: N/A.
  - *Constraints/Rules*: Must keep the plain-URL fallback that exists today for
    clients that block buttons/HTML.
  - *Acceptance criteria*: The email renders on brand across major clients and
    still exposes a copy-paste link fallback.

---

### ⚠️ Key Business Considerations
- **Trust from first contact.** The sign-in email is the very first thing a real
  user receives from Tidansu. If it fails, is slow, or looks like phishing, they
  never see the product. Reliability and legitimacy matter more here than polish.
- **Security of a bearer credential.** The magic link is enough to log in. The
  existing single-use + 15-minute-expiry properties must be preserved, secrets
  must never be logged, and the dev-only raw-link response must never reach
  production (account-takeover risk). This is why the item warrants a security
  review.
- **Operate-anywhere without embedded secrets.** The same build must run in dev
  (file) and prod (real provider) with no code change — only configuration —
  and ship with zero live credentials in source.
- **Fail loud, not silent.** A misconfigured environment must be obvious to the
  operator, not discovered by locked-out users.
- **Data residency for a Poland/EU launch.** The chosen provider processes user
  email addresses (personal data); provider location and GDPR posture feed the
  broader launch-legal picture (relates to B-5).

### 🚫 Out of Scope (Phase 1)
- Choosing/committing to a specific email provider brand (see Open Question).
- Branded/localised HTML templates and plain-text alternatives (Phase 3).
- Retry queues, delivery/bounce monitoring and analytics (Phase 3).
- User-facing "resend link" and spam-avoidance UX (Phase 2).
- Deliverability/domain-authentication (SPF/DKIM/DMARC) setup (Phase 2).
- Rate-limiting / anti-abuse on link requests beyond what exists (Phase 2).
- Any change to the token itself (expiry, single-use, generation).

### ❓ Open Questions for Product Owner
1. **Which transactional email provider?** Deferred by request. Decision inputs:
   - **EU data residency / GDPR** is a plus for a Poland-based launch (user email
     addresses are personal data). EU-hosted options (e.g. providers offering EU
     sending regions) reduce cross-border transfer questions.
   - **Least integration effort**: the current abstraction is FluentEmail behind
     `IEmailService`, and an SMTP sender is already wired for production — so any
     provider that exposes SMTP (or a FluentEmail-compatible sender) drops in with
     minimal code. A pure-API provider would need a small adapter.
   - **Free/low tier at launch scale**: sign-in volume will be low initially;
     favour a provider with a workable free/cheap tier and good deliverability
     reputation.
   - Recommend the tech-lead present 2–3 concrete options (EU-hosted SMTP-capable)
     with trade-offs for the owner to pick at the human gate.
2. **Sending identity** — what from-address and display name should production
   use (e.g. `noreply@tidansu.com`), and is that sending domain available to
   authenticate for deliverability?
3. **User-visible failure copy** — for Phase 1, is it acceptable that a delivery
   failure is only operator-visible (logged), with the user simply seeing the
   generic "check your email" message, deferring in-app failure feedback to
   Phase 2? (Assumed yes.)
