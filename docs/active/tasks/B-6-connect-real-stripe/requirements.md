# B-6 · Connect real Stripe — Functional Requirements

### 📋 Backlog Item
Connect a real Stripe account to Tidansu's existing (dormant) billing seam so that
upgrading genuinely charges: a Checkout purchase in Stripe **test mode** flips the
buyer to Pro end-to-end via a signature-verified webhook, downgrades/cancellations
return the account to Free, dev uses test keys and prod uses live keys (no secrets
in source), and the seam is ready for a §10-gated live cutover — all built and
test-verified now without waiting on the legal go-live checklist.

### 🎯 Product Context Summary
Tidansu is a spatial-inventory app on a Free/Pro model: Free caps spaces (2),
zones (6/space), items (50/space), and withholds photos and sync; Pro removes the
caps and unlocks photos and sync. Every cap already opens a paywall with a `reason`
∈ `{spaces, zones, items, photos, sync}`. **B-6 is the money path behind that
paywall** — it turns "user hit a cap and tapped Upgrade" into a real, paid Pro
account, and turns cancellation back into Free (data kept, over-cap content
read-only). The billing seam (`IBillingService` → `StripeBillingService`, a
Checkout upgrade flow, and a `/api/billing/webhook` receiver) already exists but has
never touched a real Stripe account. Critically, B-6 is fully **buildable and
verifiable in Stripe test mode today**: the B-5 legal research produced a §10
"go-live prerequisites" checklist that gates *charging a real customer / flipping to
live*, **not** building or test-verifying this integration. Requirements below keep
"build & test-mode verify" strictly separate from "go-live readiness."

### 🔑 Core Functional Areas
- **Billing-mode configuration & safe fallback** — test vs live selected by
  environment, secrets from environment only, safe behaviour when misconfigured.
- **Paid upgrade via Stripe Checkout** — the Free→Pro purchase journey.
- **Webhook trust & robustness** — signature verification, idempotency, secure
  Stripe-customer→Tidansu-user mapping; Pro is never granted from an unverified event.
- **Downgrade & cancellation handling** — subscription canceled / payment lapsed
  returns the account to Free under the plan rules.
- **Legal-checkout support hooks** — the seam *supports* Stripe Tax, the
  withdrawal-consent waiver, pre-purchase disclosures, the "Subscribe & pay" button,
  and compliant invoicing; which land in B-6 vs. a follow-up is an owner gate.
- **Live-mode cutover readiness** — documented, verifiable, and explicitly gated on
  the §10 checklist and §11 professional confirmation.
- **No-regression guarantee** — users who never touch billing are unaffected.

---

### Functional Requirements

**Billing-mode configuration & safe fallback**

- **FR-1**: The system must run against a real Stripe account, selecting **test
  mode in development** and **live mode in production** automatically by
  environment, with no manual toggle in the running app.
  - *Business rationale*: Developers and reviewers must exercise the true purchase
    flow without risk of real charges; production must charge real money. One
    codebase, environment-driven behaviour, prevents "works in dev, silently wrong
    in prod."
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Infrastructure for the Free→Pro purchase path; not itself gated.
  - *Constraints/Rules*: All keys and secrets (secret key, webhook secret, price
    identifier, success/cancel destinations) come from environment/secret
    configuration — **never committed to source**. Test-mode and live-mode
    credentials are distinct and never mixed.
  - *Acceptance criteria*: In a dev environment configured with Stripe **test**
    credentials, upgrades run through Stripe test mode; in a prod-like environment
    configured with **live** credentials, the same flow targets live Stripe. No
    Stripe secret appears anywhere in the repository.

- **FR-2**: When Stripe is **not configured or misconfigured** (missing/blank keys),
  the system must fail safely: billing is treated as unavailable with a clear,
  user-visible message, and the app never crashes and never silently grants Pro.
  - *Business rationale*: A payment surface that half-works is worse than one that's
    cleanly off. A misconfiguration must never hand out Pro for free, and must never
    take down the whole app.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Guards the Pro-purchase path; on failure no plan change occurs.
  - *Constraints/Rules*: The current dormant behaviour (a direct/no-payment billing
    mode) must remain a deliberate, documented fallback — not something that can be
    reached by accident in production and hand out Pro without payment. Missing
    configuration disables *paid upgrade*, not the rest of the app.
  - *Acceptance criteria*: With Stripe credentials absent, attempting to upgrade
    yields a clear "billing unavailable" outcome (no exception surfaced to the user,
    no crash) and the account stays Free. No path grants Pro without a verified
    payment event.

**Paid upgrade via Stripe Checkout**

- **FR-3**: A Free user who chooses to upgrade must be taken through a real Stripe
  Checkout purchase, and on successful (test-mode) payment their account becomes Pro
  **end-to-end via the webhook** — never by a manual database edit or an optimistic
  client-side flip.
  - *Business rationale*: This is the core success bar of B-6 — the paywall must
    convert into a genuinely paid Pro account, proving the whole loop (Checkout →
    payment → webhook → plan change) works against real Stripe.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: **Free → Pro.** Entry points are the existing paywall CTAs for
    every `reason` (`spaces | zones | items | photos | sync`); a successful purchase
    lifts all Free caps and unlocks photos + sync.
  - *Constraints/Rules*: Pro is applied only after Stripe confirms payment via the
    webhook (FR-5). The purchase is a subscription (recurring), consistent with the
    Pro model. Success and cancel return destinations bring the user back into the
    app in a sensible state.
  - *Acceptance criteria*: A real Stripe **test-mode** Checkout purchase, completed
    with a Stripe test card, flips the buyer's account from Free to Pro end-to-end
    through the webhook (verified by the account gaining Pro capabilities, not by an
    operator editing data). The buyer can immediately exceed former Free caps.

- **FR-4**: If the user abandons or cancels Checkout, or payment fails, the account
  remains Free and the user is returned to a clear state where they can retry.
  - *Business rationale*: Dropping out of payment is common; it must be a soft,
    recoverable moment, never a broken or half-upgraded account.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Stays Free; no `reason` change; caps unchanged.
  - *Constraints/Rules*: No partial entitlement is ever granted for an incomplete
    payment. Retrying an upgrade must work without leaving orphaned state.
  - *Acceptance criteria*: Cancelling on Stripe's page returns the user to the app
    still Free; a subsequent successful purchase still upgrades them normally.

**Webhook trust & robustness**

- **FR-5**: The webhook receiver must **verify the Stripe signature** on every
  event and reject unsigned, malformed, or forged payloads; only genuine Stripe
  events may change plan state.
  - *Business rationale*: The webhook is the sole authority that grants Pro. If it
    trusted unverified input, anyone could grant themselves Pro by posting a fake
    event. Webhook trust is the security heart of B-6.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: The only sanctioned mechanism that promotes Free → Pro.
  - *Constraints/Rules*: Verification uses the environment-supplied webhook secret
    matching the active mode (test vs live). A failed verification results in a
    rejected request and **no** plan mutation.
  - *Acceptance criteria*: A payload with a missing or invalid signature is rejected
    and changes nothing; only a correctly signed Stripe event can move an account to
    or from Pro.

- **FR-6**: Webhook processing must be **idempotent** — Stripe retries and may
  deliver the same event more than once, and events may arrive out of order; the
  outcome must be the same as processing it exactly once.
  - *Business rationale*: Stripe guarantees at-least-once delivery. Double-processing
    must not double-charge intent, corrupt state, or flip a user's plan back and
    forth. Reliability here is what makes the money path trustworthy.
  - *Priority*: Phase 2 (Growth — robustness hardening on top of the Phase 1 loop)
  - *Plan & gate*: Protects the integrity of Free↔Pro transitions.
  - *Constraints/Rules*: Re-delivery of an already-applied upgrade or cancellation
    is a no-op. The system tolerates events arriving in an unexpected order without
    ending in a wrong final plan.
  - *Acceptance criteria*: Replaying the same Stripe event (or delivering it twice)
    leaves the account in the identical, correct plan state as a single delivery,
    with no error surfaced to Stripe that would cause needless retries of an
    already-handled event.

- **FR-7**: The system must securely map a Stripe customer/subscription back to the
  correct Tidansu user, so the right account is upgraded or downgraded.
  - *Business rationale*: A mis-mapping would upgrade or downgrade the wrong person —
    a trust and support nightmare. The link between "who paid" and "which account"
    must be unambiguous and tamper-resistant.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Ensures Free→Pro and Pro→Free apply to exactly the right account.
  - *Constraints/Rules*: The Tidansu account identity carried into Checkout must be
    the authority for who is upgraded — not a client-supplied email or value that a
    user could spoof. The mapping must survive subsequent lifecycle events
    (renewals, cancellations) so later events still resolve to the same account.
  - *Acceptance criteria*: A completed test purchase upgrades only the initiating
    account; a later cancellation event for that subscription downgrades that same
    account and no other.

**Downgrade & cancellation handling**

- **FR-8**: When a subscription is canceled or payment lapses (Stripe reports the
  subscription ended/unpaid), the account must return to **Free**, keeping all the
  user's data but making over-cap content **read-only** per the plan rules.
  - *Business rationale*: Fairness and trust — losing Pro must never destroy a user's
    mapped spaces, zones, items, or photos; it just re-imposes the Free ceiling.
    Users can resubscribe and regain full editing.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: **Pro → Free.** After downgrade, content beyond Free caps
    (>2 spaces, >6 zones/space, >50 items/space) becomes read-only; photos and sync
    become Pro-gated again (the relevant `reason` fires on any attempt to add/edit
    over the cap or use a Pro-only capability).
  - *Constraints/Rules*: No data is deleted on downgrade. Downgrade is driven by a
    verified Stripe event (FR-5), mirroring how upgrade is granted — not by a guess
    or a timer. A user-initiated cancellation and a payment failure both resolve to
    the same Free end-state.
  - *Acceptance criteria*: Cancelling the test subscription (or simulating a lapsed
    payment) returns the account to Free; previously-created over-cap content is
    still visible but not editable, and photos/sync are re-gated. Resubscribing
    restores Pro capabilities over the same data.

- **FR-9**: A user-initiated downgrade/cancel path must exist and behave
  consistently with FR-8, and must also cancel the underlying Stripe subscription so
  the user is not charged again.
  - *Business rationale*: A user choosing to leave Pro must actually stop future
    billing — otherwise they keep paying after "downgrading," which is a refund and
    trust disaster. (The current seam flips the plan but leaves a TODO to cancel the
    Stripe subscription.)
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: **Pro → Free**, same read-only outcome as FR-8.
  - *Constraints/Rules*: The app's plan reflects the downgrade promptly for a good
    experience; the Stripe subscription is canceled so no renewal charge occurs.
    Immediate-flip vs. end-of-period access is an open question (see below).
  - *Acceptance criteria*: A user who cancels from within Tidansu is returned to Free
    behaviour and their Stripe test subscription is confirmed canceled (no further
    renewal events would charge them).

**Legal-checkout support hooks** *(the seam must be built so these can be switched
on for go-live; which land inside B-6 is an owner gate — see Open Questions)*

- **FR-10**: Checkout must be able to **calculate and collect destination
  VAT/sales tax** (Stripe Tax) so the price the customer pays includes the correct
  tax for their location.
  - *Business rationale*: Tidansu sells worldwide from Poland; B-5 §4–§5 establishes
    that VAT is due in the customer's country and Stripe Tax is how it's calculated
    and collected. Charging without correct tax is a compliance and pricing defect.
  - *Priority*: Phase 4 (Legal-checkout support — build the hook now; live copy/config
    finalized at go-live)
  - *Plan & gate*: Applies to the Free→Pro purchase; no change to caps.
  - *Constraints/Rules*: Whether tax is *enabled* in live Checkout is gated by §10.B
    and the owner's VAT-posture decision (§11 OQ-2). B-6 ensures the checkout flow
    *supports* tax calculation rather than assuming a bare price. Price presentation
    (VAT-inclusive vs. exclusive) interacts with currency (§11 OQ-5).
  - *Acceptance criteria*: In test mode, Checkout can be configured to compute and
    add destination tax to the Pro price without code changes at go-live; disabling
    it does not break the purchase flow.

- **FR-11**: Before Pro activates, Checkout must be able to capture the consumer's
  **express consent to immediate provision** of Pro **and** their **acknowledgement
  that they thereby lose the 14-day right of withdrawal**, and present the mandatory
  **pre-purchase disclosures** with an obligation-to-pay **"Subscribe & pay"** button.
  - *Business rationale*: B-5 §6 — without this affirmative waiver step and the
    button-labelling/disclosure rules, an EU consumer could use Pro and still demand
    a full refund within 14 days. This is a hard consumer-law requirement for
    charging EU customers.
  - *Priority*: Phase 4 (Legal-checkout support)
  - *Plan & gate*: Blocks Free→Pro activation until consent/acknowledgement is given.
  - *Constraints/Rules*: Exact wording is lawyer-reviewed (§11 OQ-10/OQ-11) and
    finalized at go-live; B-6 provides the *step/hook* in the purchase journey.
    Disclosures include total price incl. VAT, renewal terms, seller identity,
    functionality, and how to cancel/withdraw (§6.2). Legal pages
    (ToS/Regulamin, privacy, withdrawal/refund, imprint) must be reachable before
    purchase (§6.3, §10.E) — surfaced here as a dependency, drafting is downstream.
  - *Acceptance criteria*: The purchase journey can require the consent +
    acknowledgement step and show disclosures before payment; without the consent
    step being satisfiable, Pro cannot activate. (Scope decision for B-6 vs.
    follow-up is an open question.)

- **FR-12**: The system must be able to emit a **compliant invoice/receipt** for a
  Pro purchase (Stripe Invoicing: sequential numbering, seller NIP, customer tax-ID
  capture for B2B, VAT breakdown, localization) as a durable post-purchase record.
  - *Business rationale*: B-5 §7 — a paid EU sale requires a compliant invoice/receipt
    on a durable medium; Stripe Invoicing covers core fields, with PL-specific
    presentation points to confirm.
  - *Priority*: Phase 4 (Legal-checkout support)
  - *Plan & gate*: Part of the Free→Pro purchase record; no cap change.
  - *Constraints/Rules*: PLN VAT-amount presentation, gapless numbering, language,
    and retention need księgowa sign-off (§7.1/§7.2, §11 OQ-6); **KSeF structured
    e-invoicing is explicitly out of Stripe's PDF output** and is a separate,
    date-volatile dependency (§7.3) — flagged, not built here. B-6 ensures the seam
    *supports* invoice emission; final compliance config is a go-live gate.
  - *Acceptance criteria*: A test-mode purchase can produce a Stripe invoice/receipt
    carrying the mandatory fields; KSeF is documented as a separate follow-up, not
    assumed satisfied by the Stripe PDF.

**Live-mode cutover readiness**

- **FR-13**: The path from test-verified to **live** must be documented and
  executable purely by supplying live configuration — with a clear, business-language
  statement that flipping to live is **gated on the §10 checklist (A–F)** and §11
  professional confirmation.
  - *Business rationale*: The owner must be able to go live confidently once legal/tax
    prerequisites are met, without a code change — and must not be able to go live by
    accident before they are met. Keeps "built" and "authorized to charge" cleanly
    separate.
  - *Priority*: Phase 5 (Cutover readiness — documented, not a charge)
  - *Plan & gate*: Enables real Free→Pro charging once ungated.
  - *Constraints/Rules*: Going live requires: live keys/secrets set from environment;
    the Stripe live webhook registered and verified; and the §10 prerequisites
    satisfied (JDG/VAT-OSS/VAT status, Stripe Tax + Invoicing configured, KSeF plan,
    consumer-law checkout live, legal pages live, GDPR/DPA/RoPA) plus §11 open
    questions confirmed by accountant/lawyer. No live charge is made as part of B-6.
  - *Acceptance criteria*: A written, checklist-driven cutover procedure exists that
    (a) requires only configuration to switch modes and (b) explicitly references the
    §10 A–F gates and §11 confirmations as preconditions to charging a real customer.

**No-regression guarantee**

- **FR-14**: Connecting real Stripe must not change behaviour for users who never
  enter billing — plan caps, the paywall, and all existing flows work exactly as before.
  - *Business rationale*: The vast majority of interactions are non-billing; adding
    payments must not destabilize the core spatial-inventory experience.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free users hitting caps still see the paywall with the right
    `reason`; nothing about caps changes.
  - *Constraints/Rules*: The existing limit-check-before-mutate behaviour and paywall
    `reason` mapping are untouched by billing wiring.
  - *Acceptance criteria*: With billing configured, a Free user hitting any cap still
    gets the paywall with the matching `reason`; existing spaces/zones/items flows
    are unaffected.

---

### ⚠️ Key Business Considerations
- **Webhook trust is the crown jewel.** The webhook is the *only* thing that grants
  Pro; signature verification (FR-5), idempotency (FR-6), and secure user mapping
  (FR-7) are non-negotiable. A gap here means free Pro for attackers or upgrading the
  wrong account. This is a sensitive surface — the pipeline pauses for the owner and
  a security review runs at Stage 4.
- **Never grant Pro without verified payment; never lose data on downgrade.** The two
  fairness invariants: Pro comes only from a verified Stripe event, and Free-downgrade
  keeps all data (over-cap → read-only), never deletes it.
- **Build vs. authorize-to-charge are different milestones.** B-6 is *done* when
  test-mode works end-to-end; it is *not* license to charge real customers — that
  waits on §10 + §11.
- **Secrets discipline.** Test vs live keys, both from environment, never in source;
  misconfiguration disables billing safely rather than granting free Pro or crashing.
- **Privacy/compliance.** Introducing Stripe adds a processor and billing personal
  data (B-5 §8): DPA, RoPA, and transfer posture are go-live gates, consistent with
  the EU/Poland launch posture.

### 🚫 Out of Scope (Phase 1)
- Charging any **real (live-mode) customer** — gated on §10/§11.
- **KSeF** structured e-invoicing integration (separate, date-volatile dependency —
  Stripe PDFs do not satisfy it).
- Drafting the **legal pages** (ToS/Regulamin, privacy, withdrawal/refund, imprint) —
  downstream lawyer task; B-6 only ensures they're reachable before purchase.
- Finalizing consumer-law **copy/wording** for the consent waiver, disclosures, and
  button label (lawyer-reviewed at go-live).
- Adopting a **Merchant-of-Record** (Paddle/Lemon Squeezy) — baseline stays
  Stripe-direct (§9.2, OQ-3).
- **Proration, plan-change mid-cycle, multiple price tiers, coupons/trials,
  dunning/retry UX** — not part of the single Free↔Pro model for this slice.
- **Currency/localized pricing** decisions (§11 OQ-5) — may need settling but not
  built here.

### ❓ Open Questions for Product Owner
1. **Legal-checkout scope for B-6 (the big one).** Which §6/§7/§10 items land *inside*
   B-6 versus a follow-up task? Specifically: does the owner want the **consumer-law
   checkout step** (withdrawal-consent waiver + disclosures + "Subscribe & pay"
   button, FR-11) scoped and built *now* (behind config, verified in test mode), or
   deferred to a dedicated pre-go-live task? Same question for **Stripe Tax
   enablement** (FR-10) and **Stripe Invoicing** (FR-12).
2. **Downgrade timing (FR-9).** On user-initiated cancel, should Pro end
   **immediately** or remain until the **end of the paid period** (which the customer
   already paid for)? This affects perceived fairness and the read-only cutover moment.
3. **Payment-lapse grace (FR-8).** On a failed renewal, downgrade to Free
   **immediately** on the first failure, or after a short grace/retry window (matching
   Stripe's dunning)? Affects how abruptly over-cap content goes read-only.
4. **Live cutover authority.** Confirm the "done bar" (§11 OQ-1): B-6 is complete at
   **test-mode verified**, and the owner (not the pipeline) authorizes live once §10
   A–F and §11 are professionally confirmed. Agreed?
5. **VAT posture at launch (§11 OQ-2).** Register VAT-OSS from day one (charge
   destination VAT via Stripe Tax immediately) or rely on the €10k grace short-term?
   This shapes whether FR-10 must be *on* at go-live.
6. **Success/cancel return experience.** Where should the user land after a successful
   purchase vs. an abandoned checkout — straight back to the space/action they were
   gated on, or a dedicated "Welcome to Pro" confirmation?
7. **KSeF & currency (§11 OQ-5, OQ-7).** Confirm KSeF is handled as a separate task,
   and whether single-currency vs. localized pricing needs deciding before go-live
   (it interacts with VAT presentation and invoicing).

---

*Assumptions made (per ambiguity-handling): Pro is a single recurring subscription
(one price), the paywall CTA is the sole upgrade entry point, downgrade never deletes
data, and "build & test-verify now / live is owner-gated" is the correct framing per
task.md and B-5 §10. Confirm any that are wrong via the questions above.*
