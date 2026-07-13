### 📋 Backlog Item
Now that real login email (B-4) and real Stripe billing (B-6) are wired in, run a
focused verification-and-hardening sweep that proves a deployed build of Tidansu
genuinely works end-to-end on a prod-like configuration, closes any dev-only
shortcut or config leak, and produces a checklist of what was proven and how —
this is not a rewrite or new feature work.

### 🎯 Product Context Summary
Tidansu's whole value proposition — mapping real storage as spaces/zones and
tracking items with expiry, under a Free/Pro plan with hard caps — only matters if
the shipped build actually works for a real user on a real domain: they must be
able to sign in by email, build their spatial layout, hit a cap and see the right
paywall, and pay for Pro, all without a developer in the loop. B-7 is the trust
check before real users arrive: prove the full journey holds together outside the
dev sandbox, and make sure nothing that only makes sense on a developer's machine
(an auth bypass, a link written to a file, a plaintext token in an API response)
can reach a production user. B-4 and B-6 are code-complete but pending owner
action (a live Brevo account, live Stripe test-mode drives); this sweep separates
what can be proven by inspecting/running the code today from what needs the owner
to complete those provider setups first.

### 🔑 Core Functional Areas
- End-to-end flow verification on a production-like configuration (auth → spaces/
  zones/items → plan caps/paywall → billing)
- Environment-driven configuration with safe failure on misconfiguration
- Containment of dev-only shortcuts (auth bypass, dev email file, dev magic-link)
- Deploy-time network trust configuration (reverse proxy / rate-limit correctness)
- Production build & logging hygiene
- Rough-edge triage and follow-up logging
- The proof checklist itself, as a deliverable

---

### Functional Requirements

**End-to-end flow verification on a production-like configuration**

- **FR-1**: A person must be able to walk the entire core journey — request a
  magic-link, sign in, create a space, add zones positioned on its layout, add
  items (with and without expiry), hit each plan cap and see the paywall with the
  correct reason, and (for a Pro purchase) complete billing — against a build
  running under a production-like configuration (production environment settings,
  real environment variables, same-origin SPA + API, HTTPS), not just the local
  dev server.
  - *Business rationale*: Nothing proves a deployed app works like actually
    driving it end to end; dev-mode testing hides exactly the gaps (auth bypass on,
    relative URLs, permissive CORS) that would break a real user's first session.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Exercises every plan boundary directly — free-user cap on each
    of spaces (2), zones (6/space), items (50/space), photos, and sync must open
    the paywall with the matching `reason`; a Pro purchase must lift them.
  - *Constraints/Rules*: The dev-only auth bypass must be off for this walkthrough
    (build run without it, see FR-6). The walkthrough must be repeatable by anyone
    following the resulting checklist, not just tribal knowledge.
  - *Acceptance criteria*: A single documented run records, for a production-like
    build: successful magic-link sign-in: creating a space/zone/item; hitting the
    spaces, zones, items, photos, and sync caps and seeing the correct paywall
    `reason` each time; and (in Stripe test mode) a successful upgrade to Pro that
    lifts those caps. Each step names whether it was verified now or is blocked on
    an owner action (see FR-2/FR-3).

- **FR-2**: The auth leg of the journey (magic-link request → real email delivery
  → sign-in) must be proven against a real mail provider account, not just the
  dev file-based stand-in.
  - *Business rationale*: The single riskiest unknown in the whole sweep is
    "does a real email actually arrive and sign someone in" — everything else in
    the auth path is already code-verified.
  - *Priority*: Phase 1 (Core) — **blocked on owner action**
  - *Plan & gate*: N/A — this is the account-creation gate every plan sits behind.
  - *Constraints/Rules*: Requires the owner to have completed the Brevo account +
    production `SmtpSettings__*` environment variables per the existing B-4 setup
    guide. This requirement cannot be closed by code changes alone.
  - *Acceptance criteria*: With live Brevo credentials configured, requesting a
    magic-link for a real inbox delivers the "Your Tidansu sign-in link" email,
    and clicking it signs the user in exactly once before expiring. The checklist
    records this as either "verified" (with date) or "pending owner Brevo setup."

- **FR-3**: The billing leg of the journey (Checkout purchase → webhook →
  Pro applied; cancellation → Free) must be proven against a real Stripe **test
  mode** account running in the production-like build.
  - *Business rationale*: B-6 built and unit/manually verified the billing seam;
    B-7's job is to prove the *same* seam behaves identically when the app is
    running under production settings (real domain, HTTPS, environment-supplied
    secrets) rather than a developer's local dev server.
  - *Priority*: Phase 1 (Core) — **blocked on owner action**
  - *Plan & gate*: **Free → Pro** and **Pro → Free**; the purchase must lift every
    cap (`spaces`, `zones`, `items`, `photos`, `sync`) and cancellation must
    restore them with prior over-cap content read-only, exactly as specified in B-6.
  - *Constraints/Rules*: Uses Stripe **test** keys only — no live charge is made as
    part of this sweep. Requires the owner to have completed the B-6 test-mode
    drives (or this sweep runs them).
  - *Acceptance criteria*: A test-mode Checkout purchase, run against the
    production-like build with its own Stripe webhook endpoint reachable over
    HTTPS, flips the buyer to Pro end-to-end; a subsequent cancellation returns
    them to Free with data intact. The checklist records this as either "verified"
    (with date) or "pending owner Stripe test-mode drive."

**Environment-driven configuration with safe failure on misconfiguration**

- **FR-4**: Every piece of environment-specific configuration required to run in
  production — the public site URL, the database connection, the mail-provider
  credentials, the signing secret for sessions, and the Stripe keys — must come
  from environment variables/secrets at deploy time, never from a value checked
  into source, and switching environments (dev → staging → prod) must require no
  code change.
  - *Business rationale*: Hard-coded or committed production values are both a
    security exposure (a leaked secret in git history is a breach) and an
    operational trap (the same value quietly used across environments).
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A — foundational to every feature.
  - *Constraints/Rules*: A search of the repository must show no real production
    secret (mail password, signing secret, Stripe secret/webhook key) anywhere;
    only blank placeholders or clearly-marked development-only values may appear
    in committed configuration.
  - *Acceptance criteria*: The repository contains no production secret value.
    The same build artifact, given only different environment variables, runs
    correctly against a dev database/mail/Stripe test account and, separately,
    against production values — with zero source changes between the two.

- **FR-5**: If a required piece of production configuration is missing or
  invalid at startup, the application must refuse to start with a clear,
  specific message naming which setting is missing — it must never start up in a
  half-working state, silently fall back to a development behaviour, or crash
  without explanation once traffic arrives.
  - *Business rationale*: A production deploy that "sort of" starts (e.g. the
    database is unreachable, or the public site URL is blank so every magic link
    is broken) is worse than one that fails the deploy immediately and loudly —
    it turns a five-minute config fix into a live incident.
  - *Priority*: Phase 1 (Core)
  - *Constraints/Rules*: Today this fail-loud behaviour is already proven for the
    session-signing secret, the mail provider credentials, and Stripe (when
    billing is turned on but incompletely configured). It is **not yet consistent**
    for two settings that matter just as much in production: the public site URL
    (used to build every magic-link and Checkout return address) and the database
    connection. Extending the same fail-loud pattern to those two is in scope here.
  - *Acceptance criteria*: Starting the application in a production-like
    environment with any one of: the site URL, the database connection, the mail
    credentials, or (when billing is turned on) the Stripe keys missing or
    malformed, refuses to start and names the specific missing setting — no
    startup succeeds into a broken or half-configured state, and no secret value
    is ever echoed in the failure message.

- **FR-6**: Cross-origin access to the API must be limited to the site's own
  public origin(s); no wildcard or overly broad origin may be permitted in
  production, and if the origin setting is unset, cross-origin requests must be
  refused by default (fail closed, not open).
  - *Business rationale*: The API and the app are served from the same origin in
    production today, so this is mostly a defence-in-depth guard for any future
    split deployment (e.g. a separately hosted marketing site or staging
    environment) — but it must fail safe, not permissive, if misconfigured.
  - *Priority*: Phase 1 (Core) verification; Phase 2 (Growth) if multiple
    origins (e.g. an apex domain and a `www` alias) turn out to be needed.
  - *Constraints/Rules*: Confirm the current single-origin configuration covers
    the actual production domain(s) that will be used at launch; if more than one
    public hostname is planned, the configuration must support listing all of them
    without a code change.
  - *Acceptance criteria*: A request from an origin other than the configured
    site is rejected; a request from the configured site succeeds. With the
    origin setting left blank, cross-origin requests are rejected (never
    universally allowed).

**Containment of dev-only shortcuts**

- **FR-7**: The route-level authentication bypass used in local development must
  be provably impossible to activate in a production build — not merely "off by
  default," but compiled out entirely so no runtime configuration mistake can
  re-enable it.
  - *Business rationale*: An auth bypass is the single highest-stakes dev
    convenience in the codebase; if it ever reached production, anyone could open
    the whole app pretending to be signed in. It must be a build-time
    impossibility, not a runtime toggle someone could flip by mistake.
  - *Priority*: Phase 1 (Core)
  - *Constraints/Rules*: Verify (by inspecting the actual production build output,
    not just the source) that the bypass code path is absent from what gets
    shipped, and that the environment variable that names it is dev-only and not
    part of any production deployment configuration.
  - *Acceptance criteria*: Building the app for production and inspecting the
    resulting bundle shows no trace of the auth-bypass branch; running that build
    with every route requiring sign-in enforces sign-in regardless of any
    environment variable set at runtime.

- **FR-8**: The development convenience that writes sign-in emails to a local
  file instead of sending them must never activate outside a development
  environment — production must always attempt a real send and treat delivery
  failure as a visible error, never a silent success.
  - *Business rationale*: If the file-writing shortcut ever ran in production,
    users would never receive their sign-in email and would have no way to know
    why — a silent, total failure of the only way to sign in.
  - *Priority*: Phase 1 (Core)
  - *Constraints/Rules*: This is already gated on the running environment being
    Development; the sweep's job is to confirm that gate can't be bypassed by a
    misconfigured or ambiguous environment name at deploy time, and that a real
    delivery failure in production surfaces as a clear error rather than looking
    like success.
  - *Acceptance criteria*: Running the app with the production environment
    setting never writes a sign-in email to a file, always attempts a real send,
    and a forced delivery failure returns a clear error to the caller (no
    exception leaking internal detail, no silent 200-success).

- **FR-9**: The raw sign-in link (and the one-time token inside it) must never
  appear in any production API response — only a real, delivered email may ever
  carry it.
  - *Business rationale*: Returning the sign-in link directly in the response is
    a deliberate dev convenience (skip checking an inbox); in production it would
    let anyone sign in as anyone else just by knowing (or guessing) an email
    address, defeating the entire point of email verification.
  - *Priority*: Phase 1 (Core)
  - *Constraints/Rules*: Already gated on the running environment being
    Development. Confirm this holds under the exact production environment
    setting that will be deployed (not just "not literally the word Development").
  - *Acceptance criteria*: Requesting a magic-link against a production-like
    configuration returns no link and no token in the response body — only
    confirmation that a request was accepted; the link only ever reaches the user
    via their inbox.

**Deploy-time network trust configuration**

- **FR-10**: The per-address rate limit protecting the sign-in and magic-link
  request endpoints must correctly identify each real visitor once the app sits
  behind whatever reverse proxy or load balancer production uses — not silently
  degrade into treating every visitor as a single shared sender (which would let
  one busy proxy exhaust the limit for everyone) or, conversely, trust a spoofable
  header from the open internet.
  - *Business rationale*: The rate limiter's entire purpose is to slow down abuse
    of the sign-in flow. Today it trusts client-identifying headers only from a
    same-machine proxy; deployed behind a real reverse proxy/load balancer it will
    misbehave (one shared bucket for all users) until that proxy's address is
    explicitly trusted — a known gap already flagged during B-4.
  - *Priority*: Phase 1 (Core) — this is a deploy-time configuration step, not a
    code change, and must be completed as part of first production deployment.
  - *Constraints/Rules*: Only the real, known production proxy/load-balancer
    address(es) may be trusted — never a wildcard or "trust everything," which
    would let an attacker spoof their identity and dodge the limiter entirely.
  - *Acceptance criteria*: Once the production reverse-proxy topology is known,
    the trusted-proxy configuration is updated to match it, and a manual check
    confirms two different real client addresses behind that proxy are rate-
    limited independently (not sharing one bucket). Until the topology is known,
    the checklist records this explicitly as an open deploy step, not a "done."

**Production build & logging hygiene**

- **FR-11**: The production build must contain no debugging/inspection tooling
  intended only for developers (e.g. an in-app developer-tools overlay), and
  production logs must not record routine per-request database activity at a
  verbosity intended for local debugging.
  - *Business rationale*: Developer tooling bundled into a real user's page is
    unprofessional at best and a wasted download/attack-surface at worst; overly
    verbose production logs both bloat storage and make genuinely important log
    lines harder to find, without adding any real diagnostic value once things are
    working.
  - *Priority*: Phase 2 (Growth — hygiene, not a functional break)
  - *Constraints/Rules*: Confirm the developer-tools build plugin used in the
    frontend does not inject its client into a `build` (as opposed to `dev`)
    output; confirm the production logging level for routine database activity is
    turned down from development's verbose setting.
  - *Acceptance criteria*: Inspecting the production build output shows no
    developer-tools overlay code; production logs at normal operation show no
    per-query database chatter at Information level (errors and warnings remain
    visible).

**Rough-edge triage and follow-up logging**

- **FR-12**: Any additional rough edge discovered while driving the end-to-end
  walkthrough (FR-1) — broken copy, a confusing error, a missing loading state,
  anything that isn't itself a config leak or dev-shortcut — must be either fixed
  on the spot if trivial, or logged as a named, scoped follow-up backlog item; it
  must not silently vanish or block this sweep from closing.
  - *Business rationale*: A production sweep inevitably surfaces small things
    that were never anyone's job to catch; treating them ad hoc erodes trust in
    "the app basically works," while writing them down keeps the sweep itself
    small and shippable.
  - *Priority*: Phase 1 (Core) — the triage step itself; Phase 2/3 for whatever
    gets logged.
  - *Constraints/Rules*: Anything that reads as a deeper security or scalability
    concern (authorization gaps, N+1 queries, missing indexes, load behaviour)
    belongs to the follow-up B-8 audit, not fixed here — name it and hand it off
    rather than scope-creeping this sweep.
  - *Acceptance criteria*: The sweep's deliverable lists every rough edge found,
    each marked either "fixed here" or "logged as backlog item [id]," with none
    left unaccounted for.

**The proof checklist**

- **FR-13**: The sweep's primary deliverable is a single checklist document
  recording, for every requirement above, what was proven, how it was proven
  (the exact steps taken), and its current status — verified now, or blocked on
  a named owner/provider action.
  - *Business rationale*: The whole point of B-7 is confidence that production
    works, and confidence needs to be legible to a non-engineer (the product
    owner) as well as auditable later — a checklist is the artifact that carries
    that trust forward, not tribal memory of "someone tested it once."
  - *Priority*: Phase 1 (Core)
  - *Constraints/Rules*: Every acceptance criterion in FR-1 through FR-12 must
    appear on the checklist with a clear verified/pending status; anything
    "pending" must name exactly what unblocks it (an owner action, a deploy
    step, a follow-up task).
  - *Acceptance criteria*: The product owner can read the checklist and know,
    without asking an engineer, exactly which parts of "does production actually
    work" are proven today and which are waiting on them.

---

### ⚠️ Key Business Considerations
- **This is a trust sweep, not a feature.** Success is measured by what gets
  *proven* and what gets *closed off*, not by anything new a user can do.
- **Sensitive surfaces.** Auth, billing, plan gating, and CORS/redirect handling
  are all touched here — treat any change to them with the same care as B-6 (a
  security review alongside the branch review before this closes).
- **Separate "code is prod-safe" from "owner has completed provider setup."**
  Several acceptance criteria (real email delivery, a live Stripe test-mode
  purchase) cannot be closed by this sweep alone — they need the B-4/B-6 owner
  actions completed first. The checklist must say so plainly rather than
  papering over the gap.
- **Fail loud, fail safe, never fail open.** Every missing-config path in this
  sweep should end in "the app refuses to start" or "the request is refused" —
  never a silent fallback to a permissive or free/dev-equivalent behaviour.
- **Keep B-8 out of scope.** Deep authorization/IDOR, N+1/scalability, and load
  concerns are the follow-up audit's job; this sweep only owns trivial
  config/leak fixes plus verification.

### 🚫 Out of Scope (Phase 1)
- Deep security review of authorization/ownership checks on spaces/zones/items
  (B-8).
- Scalability/load testing, query/index review (B-8).
- Any live (real-money) Stripe charge — this sweep stays in test mode.
- Drafting/finalizing legal-checkout copy or Stripe Tax/Invoicing enablement
  (tracked under B-6's legal-checkout hooks, gated separately).
- A verified sending domain (SPF/DKIM/DMARC) for email deliverability beyond a
  single verified sender — noted as a recommended follow-up, not required to
  close this sweep.
- New features or UX changes of any kind.

### ❓ Open Questions for Product Owner
1. **Timing**: do you want this sweep run now (closing everything that's
   code-verifiable, with the email/billing end-to-end proofs marked "pending"),
   or held until the Brevo account and a Stripe test-mode drive are ready so the
   whole checklist can close in one pass?
2. **Production topology**: is the production deployment a single host serving
   both the API and the built SPA from one origin (as today), or could the
   frontend ever be hosted separately (a CDN, a different domain)? This decides
   how much the CORS multi-origin question (FR-6) actually matters.
3. **Reverse proxy details (FR-10)**: what will actually sit in front of the API
   in production (a specific load balancer, a PaaS edge, nothing)? The trusted-
   proxy configuration can't be finalized without this.
4. **Rough-edge follow-ups (FR-12)**: should follow-ups discovered during the
   sweep be filed as new backlog items automatically, or batched for your
   review before filing?
5. **Sending domain timing**: is authenticating a real sending domain in Brevo
   (SPF/DKIM, better deliverability than a single verified sender) something to
   do before or after this sweep, given it needs DNS access you control?

---

*Assumptions made (per ambiguity-handling): production serves the SPA and API
from one origin (matching the current build-to-`wwwroot` setup), so the CORS
question is defence-in-depth rather than a hard blocker; "prod-like config" means
running with `ASPNETCORE_ENVIRONMENT=Production`-equivalent settings and real
(or test-mode) provider credentials, not a live production deployment with real
traffic; the checklist itself is the deliverable artifact for this task
(separate from `tech-tasks.md`, which will carry whatever small code changes
FR-5/FR-6/FR-11 require). Confirm any of these via the questions above.*
