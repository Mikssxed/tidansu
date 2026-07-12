### 📋 Backlog Item
Produce a **research write-up** that establishes whether — and under what
conditions — a Poland-based sole trader (JDG) can legally sell a paid Tidansu SaaS
subscription **worldwide** using **Stripe as the billing & invoicing system of
record**, and that surfaces every finding, gap, and open question the owner must
confirm with a real accountant/lawyer before B-6 flips Stripe to live.

### 🎯 Product Context Summary
This is **not application code** — the deliverable is a legal & compliance
findings document (in `docs/`) that gates B-6 (real Stripe). Tidansu's owner is
based in **Poland** and intends to sell a Pro subscription to anyone on the
internet (EU + non-EU), operating as a **sole trader (JDG)** with **Stripe Tax +
Stripe invoices** doing the tax and invoicing work. These requirements therefore
define the *requirements of the document*: the questions it must answer, the
topics it must cover, the structure it must follow, the citation/trust bar it must
clear, and what "done" means for the artifact. The owner's three decisions
(worldwide market, JDG baseline, Stripe-does-everything) are **settled inputs**;
the research must *validate* the Stripe assumption rather than re-open the choices.

### 🔑 Core Functional Areas
- **Document integrity** — structure, "not legal advice" framing, findings-vs-open-questions separation, citation discipline.
- **Business registration in Poland** — JDG baseline, unregistered-activity path, when sp. z o.o. becomes relevant, thresholds.
- **VAT & tax obligations** — EU OSS for B2C digital services, place-of-supply, PL VAT registration thresholds, non-EU (US sales tax nexus, UK VAT, etc.), and whether Stripe Tax closes each gap.
- **Consumer protection** — right of withdrawal for digital goods, the consent/waiver to start service immediately, required pre-purchase disclosures, T&C/ToS obligations.
- **Invoicing** — Polish invoice requirements, KSeF direction/timeline, and whether Stripe-generated invoices satisfy them.
- **GDPR for a paid app** — Stripe as processor (DPA), records of processing, privacy-policy needs specific to taking payments.
- **Stripe-sufficiency verdict & Merchant-of-Record comparison** — does the "Stripe does everything" assumption actually hold, or is a separate tool / MoR needed?
- **B-6 handoff** — the concrete list of what findings change *how* Stripe goes live.

---

### Functional Requirements

**Document integrity & trust bar**
- **FR-1**: The document must open with a prominent disclaimer that it is **research to inform a professional consultation — not legal or tax advice** — and name the professional roles that must confirm it (Polish accountant / księgowa and, where relevant, a lawyer).
  - *Business rationale*: The owner will make real financial/legal commitments off this doc; misrepresenting research as advice is a liability and a trust failure.
  - *Priority*: Phase 1 (Core)
  - *Constraints/Rules*: Disclaimer appears before any finding; every section that gives a number, threshold, or deadline is tagged as "to be confirmed" unless backed by a primary source.
  - *Acceptance criteria*: The doc's first section states it is not legal/tax advice and lists the professionals who must validate it.
- **FR-2**: Every material claim (threshold, rate, obligation, deadline, "Stripe covers X") must be **cited to an authoritative or primary source** — Polish government/tax authority, EU legislation/guidance, UK/US tax authority, or official Stripe documentation — with a retrievable reference and, where a date matters, the date the source was checked.
  - *Business rationale*: The owner must be able to independently verify each claim; uncited legal claims are unusable.
  - *Priority*: Phase 1 (Core)
  - *Constraints/Rules*: Prefer primary sources (legislation, tax-authority pages, official Stripe docs) over blogs/forums; where only secondary sources exist, say so and mark the claim lower-confidence. No claim stands without a source.
  - *Acceptance criteria*: Each finding carries at least one cited source; a reviewer can follow a citation to confirm the stated fact; secondary-only claims are flagged as such.
- **FR-3**: The document must **cleanly separate confirmed findings from open questions**, with a dedicated, consolidated "Open questions for a Polish accountant/lawyer" section in addition to any inline flags.
  - *Business rationale*: The owner needs a ready-made agenda to take into a paid consultation; blurring the two risks acting on an unconfirmed assumption.
  - *Priority*: Phase 1 (Core)
  - *Constraints/Rules*: Anything not backed by a primary source, or that depends on the owner's specifics (revenue, residency details, VAT status), belongs in open questions, not findings.
  - *Acceptance criteria*: A reader can list, from one section, every question that still needs professional confirmation; no item in "findings" is actually an unresolved question.
- **FR-4**: The document must state its **scope and assumptions explicitly** up front: worldwide sale (EU + non-EU), JDG baseline, Stripe (Stripe Tax + Stripe invoices) as billing/invoicing system of record, B2C digital-services subscription, and the date the research reflects.
  - *Business rationale*: Legal/tax conclusions are only valid for a given fact pattern; making the assumptions explicit lets the professional spot where the owner's reality differs.
  - *Priority*: Phase 1 (Core)
  - *Acceptance criteria*: An assumptions/scope block names the market, business form, billing system, customer type, and as-of date.

**Business registration in Poland (JDG)**
- **FR-5**: The document must explain the **registration path for a JDG** (jednoosobowa działalność gospodarcza) selling SaaS to consumers worldwide, including what registration entails, relevant activity classification (e.g. PKD codes at a descriptive level), and any registration prerequisites for issuing invoices and handling VAT.
  - *Business rationale*: The owner's baseline is JDG; they need to know the concrete steps and obligations that come with it.
  - *Priority*: Phase 1 (Core)
  - *Constraints/Rules*: Focus on the digital-services / SaaS case; describe obligations in business terms, not as a filing tutorial.
  - *Acceptance criteria*: The doc states what registering a JDG to sell SaaS involves and which obligations attach on day one.
- **FR-6**: The document must cover the **unregistered business activity (działalność nierejestrowana) path** — its income threshold, whether selling digital services to consumers (especially cross-border, with VAT/OSS obligations) is compatible with it, and why it likely is or isn't viable for this case.
  - *Business rationale*: An unregistered path could delay/avoid registration cost, but cross-border VAT duties may rule it out — the owner should know before assuming JDG is mandatory.
  - *Priority*: Phase 1 (Core)
  - *Constraints/Rules*: Must reconcile the unregistered-activity threshold with EU OSS/VAT obligations that may force registration regardless of revenue.
  - *Acceptance criteria*: The doc gives a clear "viable / not viable and why" verdict on the unregistered path for worldwide SaaS sales, with the threshold cited.
- **FR-7**: The document must identify **when scale or risk would push toward a limited company (sp. z o.o.)** rather than a JDG — e.g. liability exposure, revenue level, tax efficiency (ZUS/składka zdrowotna considerations at a descriptive level) — without recommending a switch.
  - *Business rationale*: JDG is the launch baseline, but the owner should understand the signals that would justify revisiting the form later.
  - *Priority*: Phase 3 (Later)
  - *Acceptance criteria*: The doc lists the concrete triggers that would make sp. z o.o. worth reconsidering.

**VAT & tax obligations**
- **FR-8**: The document must explain the **place-of-supply rule for B2C digital services** (VAT is due in the *customer's* country) and what that means for a PL seller shipping worldwide.
  - *Business rationale*: This rule is the root of nearly every downstream VAT obligation; getting it wrong under- or over-charges every customer.
  - *Priority*: Phase 1 (Core)
  - *Acceptance criteria*: The doc states, with citation, that B2C digital-service VAT follows the customer's location and explains the consequence for pricing/collection.
- **FR-9**: The document must explain the **EU OSS (One-Stop-Shop) scheme** for EU B2C digital sales — what it is, how it lets a PL seller remit EU-wide VAT through one return, the EU-wide micro-business threshold (if any) below which home-country VAT rules apply, and how registering for OSS interacts with the JDG.
  - *Business rationale*: OSS is the mechanism that makes selling to EU consumers administratively feasible; the owner needs to know whether/when to register.
  - *Priority*: Phase 1 (Core)
  - *Constraints/Rules*: Must address the cross-border micro-threshold and whether the owner falls above or below it in the worldwide-from-day-one scenario.
  - *Acceptance criteria*: The doc explains OSS, states the relevant threshold, and says whether the owner should register for OSS to sell to EU consumers.
- **FR-10**: The document must cover **VAT registration thresholds and status in Poland** — the domestic VAT-exemption threshold, whether/why cross-border digital sales remove that exemption, and whether the owner becomes a registered VAT payer as a result.
  - *Business rationale*: Whether the owner is a VAT payer changes invoicing, pricing, and returns; cross-border digital sales commonly force registration regardless of turnover.
  - *Priority*: Phase 1 (Core)
  - *Acceptance criteria*: The doc states whether this business must register for VAT (and why), with the PL threshold cited.
- **FR-11**: The document must cover **non-EU tax obligations at least at the "what arises / how it's handled" level** — US sales tax **economic nexus** (state thresholds, that it can arise without physical presence), UK VAT on B2C digital sales to UK consumers, and a note that other jurisdictions (e.g. Canada, Australia, Norway, Switzerland) have similar digital-services rules.
  - *Business rationale*: "Worldwide" means obligations can arise in dozens of jurisdictions; the owner must understand the shape of this risk even if not every country is enumerated.
  - *Priority*: Phase 2 (Growth)
  - *Constraints/Rules*: Depth expectation: explain the *mechanism* and thresholds for US and UK; for the long tail, describe the pattern and defer specifics to Stripe Tax coverage / professional advice.
  - *Acceptance criteria*: The doc explains US economic nexus and UK digital-VAT obligations and acknowledges the broader long tail of jurisdictions.
- **FR-12**: The document must **validate whether Stripe Tax actually covers** the PL/EU/UK/US and long-tail obligations above — what Stripe Tax calculates and collects, what it does **not** do (e.g. filing/remittance of returns, OSS registration, US state registration/filing), and therefore where a gap remains that needs a separate tool, a filing service, or a Merchant-of-Record.
  - *Business rationale*: The whole "Stripe does everything" assumption hinges on this; a calculation tool that doesn't *file* still leaves the owner with returns to submit.
  - *Priority*: Phase 1 (Core)
  - *Constraints/Rules*: Must distinguish **calculation/collection** (what Stripe Tax does) from **registration and remittance/filing** (often still the seller's job); cite Stripe's own documentation.
  - *Acceptance criteria*: The doc gives an explicit gap analysis: for PL, EU-OSS, UK, and US, it states whether Stripe Tax handles calculation, collection, and filing — and names each remaining owner responsibility.

**Consumer protection**
- **FR-13**: The document must explain the **consumer right of withdrawal for digital content/services** (the EU 14-day cooling-off period) and the **explicit consent + acknowledgement/waiver** required to begin the paid service immediately and lose the withdrawal right — including how that consent must be captured at purchase.
  - *Business rationale*: Without the correct consent flow, every new subscriber could demand a refund within 14 days even after using Pro; this directly shapes the B-6 checkout.
  - *Priority*: Phase 1 (Core)
  - *Constraints/Rules*: Must state the exact consumer-facing wording/consent requirement in business terms and note it applies to EU consumers; flag whether non-EU (e.g. UK) equivalents differ.
  - *Acceptance criteria*: The doc explains the withdrawal right and specifies the consent/waiver Tidansu must collect at checkout to start service immediately.
- **FR-14**: The document must list the **required pre-purchase disclosures** for selling a digital subscription to consumers — total price incl. VAT, subscription/renewal terms, seller identity and contact details, functionality/interoperability of the digital service, and how to cancel.
  - *Business rationale*: Missing mandatory disclosures is a consumer-law breach and undermines trust; these become concrete UI/page requirements for B-6.
  - *Priority*: Phase 1 (Core)
  - *Acceptance criteria*: The doc enumerates each mandatory pre-purchase disclosure and where it must appear (checkout vs terms).
- **FR-15**: The document must state the **Terms & Conditions / Terms-of-Service and related legal-page obligations** — what a compliant ToS for a paid EU-facing SaaS must contain, and which legal pages must exist and be accessible (ToS, privacy policy, refund/withdrawal policy, seller/imprint details).
  - *Business rationale*: These pages are a hard prerequisite for going live and are directly consumed by B-6.
  - *Priority*: Phase 1 (Core)
  - *Acceptance criteria*: The doc lists the required legal pages and the essential contents of the ToS for a paid subscription.

**Invoicing**
- **FR-16**: The document must state **what a compliant invoice must contain under Polish law** for this business, when an invoice must be issued (incl. B2C vs on request), and record-keeping/retention obligations.
  - *Business rationale*: Invoicing correctness is a tax-authority requirement; the owner needs the mandatory invoice contents to judge Stripe's output.
  - *Priority*: Phase 1 (Core)
  - *Acceptance criteria*: The doc lists mandatory Polish invoice fields and the issuance/retention rules, cited.
- **FR-17**: The document must **validate whether Stripe-generated invoices satisfy Polish requirements**, calling out any missing mandatory fields, numbering, currency/VAT presentation, or language concerns — and whether a separate Polish invoicing tool (e.g. an integration) is needed alongside Stripe.
  - *Business rationale*: This directly tests the "Stripe does everything" assumption for invoicing; a gap here means an extra tool before B-6 can go live.
  - *Priority*: Phase 1 (Core)
  - *Constraints/Rules*: Compare Stripe invoice output against the FR-16 field list; give a clear "sufficient / not sufficient + what's missing" verdict.
  - *Acceptance criteria*: The doc concludes whether Stripe invoices are alone sufficient for a PL JDG and names any gap/extra tool required.
- **FR-18**: The document must cover the **KSeF (Krajowy System e-Faktur) direction and timeline** — what KSeF is, its mandatory-adoption schedule and who it applies to, and whether/when Tidansu's invoicing (Stripe or otherwise) must feed KSeF.
  - *Business rationale*: A looming e-invoicing mandate could force an invoicing change soon after launch; the owner should plan for it now.
  - *Priority*: Phase 2 (Growth)
  - *Constraints/Rules*: State the current known mandate dates and flag them as subject to change (KSeF timelines have shifted) → open question for the accountant.
  - *Acceptance criteria*: The doc explains KSeF, gives the current mandate timeline with a caution that it may change, and states the implication for Stripe-based invoicing.

**GDPR for a paid app**
- **FR-19**: The document must identify the **GDPR obligations that specifically arise from running a *paid* app** with Stripe as a payment processor — that Stripe acts as a **processor** requiring a Data Processing Agreement, that payment/billing data adds to the records of processing (RoPA), and any implications of international data transfers (Stripe entity/data location).
  - *Business rationale*: Taking payments adds a processor and new personal data; the owner must have the DPA and records in place to be compliant.
  - *Priority*: Phase 1 (Core)
  - *Constraints/Rules*: Note EU data-residency / transfer considerations consistent with the owner's preference for GDPR-friendly providers; cite Stripe's DPA and processor terms.
  - *Acceptance criteria*: The doc names the Stripe DPA requirement, the added records-of-processing entries, and any data-transfer consideration.
- **FR-20**: The document must state the **privacy-policy additions** needed for a paid app — disclosing Stripe as a payment processor, what billing data is processed and why, retention, and the user's rights — so the privacy policy is B-6-ready.
  - *Business rationale*: The privacy policy must reflect payment processing before charging real customers; this is a concrete B-6 page dependency.
  - *Priority*: Phase 1 (Core)
  - *Acceptance criteria*: The doc lists the privacy-policy sections/disclosures that must be added because payments are introduced.

**Stripe-sufficiency verdict & Merchant-of-Record comparison**
- **FR-21**: The document must deliver an explicit **overall verdict on the "Stripe does everything" assumption** — a consolidated statement of what Stripe (Stripe Tax + Stripe invoices) genuinely handles end-to-end vs. what the owner must still do or acquire (VAT/OSS registration & filing, US/UK obligations, PL-compliant invoicing, KSeF).
  - *Business rationale*: This is the single most decision-relevant output for the owner and for B-6; it converts scattered findings into a go/no-go picture.
  - *Priority*: Phase 1 (Core)
  - *Acceptance criteria*: The doc contains a clear consolidated verdict listing what Stripe covers and every residual owner responsibility.
- **FR-22**: The document must **compare Stripe-direct vs. a Merchant-of-Record (MoR)** model (e.g. Paddle, Lemon Squeeze, or similar) — where an MoR becomes seller-of-record and assumes worldwide tax/invoicing/consumer-law liability — with the trade-offs (cost, control, PL-specific fit) so the owner can weigh it against Stripe.
  - *Business rationale*: If the Stripe gaps (FR-12, FR-17) are large, an MoR may be the simpler compliant path; the owner should see this alternative even though Stripe is the current assumption.
  - *Priority*: Phase 2 (Growth)
  - *Constraints/Rules*: Present as a trade-off comparison, not a recommendation to switch; note that adopting an MoR would materially change B-6.
  - *Acceptance criteria*: The doc summarizes the MoR alternative and its trade-offs against the Stripe-direct approach.

**B-6 handoff**
- **FR-23**: The document must end with a **"What this changes for B-6" section** translating findings into concrete go-live prerequisites: required legal pages (ToS, privacy, withdrawal/refund policy, seller details), the withdrawal-consent step in checkout, VAT handling/Tax enablement in Checkout, invoice/receipt requirements, and any registration (JDG/VAT/OSS) that must exist before charging real customers.
  - *Business rationale*: B-5's entire purpose is to gate and shape B-6; this section is the actionable bridge the tech-lead for B-6 will consume.
  - *Priority*: Phase 1 (Core)
  - *Constraints/Rules*: Presented as a checklist of prerequisites and configuration decisions in business terms — not implementation instructions.
  - *Acceptance criteria*: A reader can derive, from this one section, the full list of legal/compliance prerequisites B-6 must satisfy before flipping Stripe to live.

---

### ⚠️ Key Business Considerations
- **Decision-usefulness over exhaustiveness.** The owner needs a doc they can act on and take to a professional — clarity, a clean open-questions list, and the Stripe-sufficiency verdict matter more than covering every country on earth.
- **Trust & liability.** The "not legal/tax advice" framing and per-claim citations are non-negotiable; the doc must never let an unconfirmed assumption masquerade as settled fact.
- **The Stripe assumption is the crux.** The most valuable analysis is separating what Stripe *calculates/collects* from what still requires the owner to *register and file* — that gap is where real risk and cost hide.
- **Data residency / GDPR-friendliness** remains a standing owner preference for any provider processing personal data (payments included); flag transfer/residency considerations for Stripe.
- **Timelines shift.** Thresholds and especially KSeF dates change — every date-sensitive claim must be dated and flagged for professional confirmation.

### 🚫 Out of Scope (Phase 1)
- Actually performing the JDG/VAT/OSS registration or drafting the legal pages/ToS themselves (those are downstream tasks once the owner confirms with a professional).
- Enumerating tax rules for every non-EU country individually — US and UK in depth, the rest as a described pattern.
- Any Stripe *code* changes or checkout wiring — that is B-6.
- A definitive recommendation to switch business form (JDG→sp. z o.o.) or to adopt an MoR — the doc informs, the owner + professional decide.
- Accounting-software selection, bookkeeping process design, or ZUS optimization beyond a descriptive note.

### ❓ Open Questions for Product Owner
1. **Confidence bar for "done."** Is a well-cited research doc with a clear open-questions list sufficient to unblock B-6, or does the owner want a paid accountant/lawyer consultation to happen *before* B-6 starts? (Assumption: the doc unblocks B-6 planning, but going *live* waits on professional confirmation.)
2. **Launch VAT posture.** Is the owner comfortable that selling B2C digital services cross-border likely forces VAT/OSS registration from early on (removing any small-seller exemption)? This affects launch timing.
3. **Appetite for a Merchant-of-Record.** If the Stripe gaps (filing/remittance, PL invoicing, KSeF) turn out significant, is the owner open to an MoR (Paddle/Lemon Squeezy-style) as an alternative, or is staying on Stripe a firm constraint?
4. **Jurisdiction depth.** Beyond EU + US + UK, are there specific countries the owner expects meaningful sales in (that warrant individual research), or is the "described pattern + Stripe Tax coverage" level acceptable for the long tail?
5. **Currency & pricing.** Will Pro be priced in a single currency (e.g. EUR/USD) or localized? This interacts with VAT presentation and invoice requirements and may need to be settled before B-6.
