# B-5 · Legal & compliance to charge customers in Poland — Execution Plan (research)

_Author: tech-lead · Date: 2026-07-12 · Status: tech-planning · Scope: requirements FR-1..FR-23_

## Context & framing (read first)

**This is a research deliverable, not code.** There is no build, no type-check, no
migration, no Kiota regen, no app to drive. The pipeline bends: "implementation"
means *producing a well-cited legal & compliance findings document*, and
"verification" means *coverage + citation discipline*, not a green build.

Each task below produces (or fills) one or more **sections of a single output
document**, names the **FR ids it must satisfy**, lists the **specific questions it
must answer**, and names the **primary/authoritative sources** to consult. Work them
in order — later sections (the Stripe-sufficiency verdict, the B-6 handoff) consolidate
earlier findings, so they are genuinely blocked by the section tasks above them.

### The executing agent should use the `research` skill

The heavy web research in each Phase-1/2/3 task should be run via the repo's
**`research` skill** (investigate a question against high-trust primary sources and
capture findings to Markdown). Run it **per topic-section** (one focused research
question per task), then fold its cited output into the corresponding section of the
output doc. Prefer primary sources; when only secondary sources exist, say so and mark
the claim lower-confidence (FR-2).

### The crux (keep it front of mind on every tax/invoice task)

The single most decision-relevant analysis is separating what Stripe Tax + Stripe
invoices **calculate / collect / generate** from what the owner must still
**register for and file/remit**. That gap drives the go-live checklist (FR-12, FR-17,
FR-21) and the B-6 handoff (FR-23). Every VAT/tax/invoice section must land on the
correct side of that line and cite Stripe's own docs for the "Stripe does X" claims.

### Output document

- **Path (create):** `docs/legal/poland-payments-compliance.md` (single consolidated
  deliverable; `docs/legal/` is a new folder).
- **Section skeleton** the tasks below fill, in order:
  0. Disclaimer & professionals-to-confirm (FR-1)
  1. Scope, assumptions & as-of date (FR-4)
  2. How to read this doc: findings vs open questions, citation convention (FR-2, FR-3)
  3. Business registration in Poland — JDG, unregistered activity, sp. z o.o. triggers (FR-5, FR-6, FR-7)
  4. VAT & tax — place of supply, EU OSS, PL VAT registration, non-EU (US/UK/long tail) (FR-8..FR-11)
  5. Stripe Tax gap analysis — calculate/collect vs register/file, per jurisdiction (FR-12)
  6. Consumer protection — withdrawal right + consent/waiver, pre-purchase disclosures, ToS/legal pages (FR-13, FR-14, FR-15)
  7. Invoicing — PL invoice requirements, Stripe-invoice sufficiency, KSeF (FR-16, FR-17, FR-18)
  8. GDPR for a paid app — Stripe as processor/DPA, RoPA, transfers, privacy-policy additions (FR-19, FR-20)
  9. Stripe-sufficiency verdict & Merchant-of-Record comparison (FR-21, FR-22)
  10. What this changes for B-6 — go-live prerequisites checklist (FR-23)
  11. Consolidated open questions for a Polish accountant/lawyer (FR-3, + the 5 carried below)
  12. Sources / references index (retrievable links, date checked)

---

## 1. 📋 Research & Writing Tasks

### Scaffold — document skeleton & trust bar (do first)

- [x] create the output doc with full section skeleton in `docs/legal/poland-payments-compliance.md`
  — add all 13 headings from the skeleton above as empty stubs so later tasks fill known slots.
  Add the sources/references index (§12) and the consolidated open-questions (§11) as living
  sections appended to throughout.
- [x] write §0 **Disclaimer & professionals to confirm** — satisfies **FR-1**.
  *Answer:* state prominently, before any finding, that this is *research to inform a
  professional consultation — not legal or tax advice*; name the roles that must validate it
  (Polish accountant / księgowa; a lawyer for consumer-law/ToS and GDPR). State that every
  number/threshold/deadline is "to be confirmed" unless backed by a cited primary source.
- [x] write §1 **Scope, assumptions & as-of date** — satisfies **FR-4**.
  *Answer:* worldwide sale (EU + non-EU); JDG baseline; Stripe (Stripe Tax + Stripe invoices)
  as billing/invoicing system of record; B2C digital-services subscription (Tidansu Pro); the
  as-of date (2026-07-12) the research reflects. State that conclusions are valid only for this
  fact pattern.
- [x] write §2 **How to read this doc** — satisfies **FR-2, FR-3** (conventions only).
  *Answer:* define the citation convention (every material claim carries ≥1 retrievable source
  + date-checked where a date matters; primary sources preferred; secondary-only claims flagged
  lower-confidence), and the findings-vs-open-questions rule (anything unbacked by a primary
  source, or dependent on the owner's specifics, goes to §11 not into findings).

### Phase 1 — Core sections (the go-live-critical body)

- [x] research + write §3 **Business registration in Poland (JDG, unregistered, sp. z o.o.)**
  — satisfies **FR-5, FR-6**; scaffolds **FR-7** (fill triggers here or defer to the Phase-3 task).
  🔒 blocked by: scaffold tasks.
  *Questions:* (a) What does registering a JDG to sell SaaS to consumers worldwide entail, and
  which obligations attach on day one (invoicing capability, VAT handling prerequisites, activity
  classification / PKD at a descriptive level)? (b) The **działalność nierejestrowana**
  (unregistered activity) path: its income threshold, and whether cross-border B2C digital sales
  with EU-OSS/VAT duties are compatible with it — give a clear "viable / not viable and why"
  verdict, reconciling the revenue threshold against VAT obligations that may force registration
  regardless of turnover.
  *Sources:* biznes.gov.pl (CEIDG registration, działalność nierejestrowana), podatki.gov.pl.

- [x] research + write §4 **VAT & tax obligations** — satisfies **FR-8, FR-9, FR-10**; scaffolds **FR-11**.
  🔒 blocked by: §3 (registration status feeds VAT status).
  *Questions:* (a) **Place of supply** for B2C digital services (VAT due in the *customer's*
  country) and the consequence for pricing/collection worldwide (FR-8). (b) **EU OSS** — what it
  is, how it lets a PL seller remit EU-wide VAT via one return, the EU-wide **micro-business
  threshold (~€10,000)** below which home-country rules apply and whether the worldwide-from-day-one
  owner is above/below it, and how OSS registration interacts with the JDG (FR-9). (c) **PL VAT
  registration** — the domestic exemption threshold, whether/why cross-border digital sales remove
  that exemption, and whether the owner becomes a registered VAT payer as a result (FR-10). Give a
  clear "must register for VAT (and why)" answer.
  *Sources:* EU Commission VAT/OSS guidance (europa.eu — Taxation and Customs Union, OSS),
  Council Directive 2006/112/EC place-of-supply articles, podatki.gov.pl (VAT registration/thresholds),
  biznes.gov.pl (VAT-OSS / procedura unijna).

- [x] research + write §4 (non-EU subsection) **US / UK / long-tail obligations** — satisfies **FR-11** (Phase 2 priority, but its findings feed the FR-12 gap analysis, so do it before §5).
  🔒 blocked by: §4 EU subsection.
  *Questions:* (a) **US sales tax economic nexus** — that it can arise without physical presence,
  the state-by-state threshold pattern (e.g. $100k / 200-transaction style thresholds), and that
  digital SaaS taxability varies by state. (b) **UK VAT** on B2C digital sales to UK consumers
  (post-Brexit; no UK registration threshold for non-established sellers making B2C digital supplies).
  (c) A note that Canada (GST/HST), Australia (GST), Norway (VOEC), Switzerland, etc. have similar
  digital-services rules. Explain the **mechanism** for US + UK in depth; describe the long tail as a
  pattern and defer specifics to Stripe Tax coverage / professional advice.
  *Sources:* HMRC (VAT on digital services / non-established taxable persons), US Streamlined Sales
  Tax + representative state DOR economic-nexus pages (e.g. California CDTFA, Texas), Stripe Tax
  jurisdiction docs for the long-tail pattern.

- [x] research + write §5 **Stripe Tax gap analysis** — satisfies **FR-12** (the crux). 🔒 blocked by: §4 (both EU and non-EU subsections).
  *Questions:* For **PL, EU-OSS, UK, and US** state — in a per-jurisdiction table — whether Stripe
  Tax handles **calculation**, **collection**, and **filing/remittance**, and name each remaining
  **owner responsibility** (OSS registration + filing, US state registration + filing, PL VAT
  returns). Explicitly distinguish *calculation/collection* (what Stripe Tax does) from
  *registration and remittance/filing* (usually still the seller's job; note Stripe's paid
  filing/partner offerings where they exist and their scope). Cite Stripe's own documentation for
  every "Stripe does / does not do X" claim.
  *Sources:* Stripe Tax docs (stripe.com/docs/tax — supported countries, what Stripe Tax does,
  registrations, filing/partners), Stripe Tax for OSS.

- [x] research + write §6 **Consumer protection** — satisfies **FR-13, FR-14, FR-15**. 🔒 blocked by: scaffold tasks (independent of tax sections — can run in parallel with §3–§5).
  *Questions:* (a) The EU **14-day right of withdrawal** for digital content/services, and the
  **explicit consent + acknowledgement/waiver** required to begin the paid service immediately and
  lose that right — including how the consent must be captured at purchase and the exact
  consumer-facing meaning in business terms; flag whether non-EU (UK) equivalents differ (FR-13).
  (b) The **mandatory pre-purchase disclosures** — total price incl. VAT, subscription/renewal
  terms, seller identity + contact, functionality/interoperability of the digital service, how to
  cancel — and *where* each must appear (checkout vs terms) (FR-14). (c) The **ToS/legal-page
  obligations** — what a compliant ToS for a paid EU-facing SaaS must contain, and which pages must
  exist and be accessible (ToS, privacy policy, refund/withdrawal policy, seller/imprint details)
  (FR-15).
  *Sources:* Consumer Rights Directive 2011/83/EU (Arts. 6, 8, 9, 14, 16 — distance contracts,
  withdrawal, digital content exception), europa.eu Your Europe (consumer rights / right of
  withdrawal), Polish Ustawa o prawach konsumenta (UOKiK), UK Consumer Contracts Regulations 2013
  for the UK divergence note.

- [x] research + write §7 **Invoicing (PL requirements + Stripe sufficiency + KSeF)** — satisfies **FR-16, FR-17**; **FR-18** (Phase 2). 🔒 blocked by: §4 (VAT status determines invoice content) and §5 (Stripe capabilities).
  *Questions:* (a) **Mandatory Polish invoice contents** for this business, when an invoice must be
  issued (B2C vs on request), and record-keeping/retention obligations (FR-16). (b) **Stripe-invoice
  sufficiency** — compare Stripe's invoice output field-by-field against the FR-16 list and give a
  clear "sufficient / not sufficient + what's missing" verdict (missing mandatory fields, numbering,
  currency/VAT presentation, language) and whether a separate Polish invoicing tool is needed
  alongside Stripe (FR-17). (c) **KSeF** — what it is, the current mandatory-adoption schedule and
  who it applies to, and whether/when Tidansu's invoicing must feed KSeF; state current known dates
  **and flag them as subject to change** → open question for the accountant (FR-18).
  *Sources:* podatki.gov.pl / Ustawa o VAT invoice-content articles, biznes.gov.pl (faktury), the
  official KSeF portal (ksef.podatki.gov.pl) for the mandate timeline, Stripe Invoicing docs for
  field/customization capability.

- [x] research + write §8 **GDPR for a paid app** — satisfies **FR-19, FR-20**. 🔒 blocked by: scaffold tasks (can run in parallel with §3–§7).
  *Questions:* (a) The GDPR obligations arising specifically from a **paid** app with Stripe:
  Stripe as a **processor** requiring a **DPA**, the added **records of processing (RoPA)** entries
  for payment/billing data, and international-**data-transfer** / data-residency considerations
  (Stripe entity + data location; SCCs), consistent with the owner's GDPR-friendly-provider
  preference (FR-19). (b) The **privacy-policy additions** for a paid app — disclosing Stripe as a
  payment processor, what billing data is processed and why, retention, and users' rights — so the
  policy is B-6-ready (FR-20).
  *Sources:* Stripe DPA + Privacy Center + list of Stripe processing entities / sub-processors,
  GDPR Arts. 28 (processor), 30 (RoPA), 44–49 (transfers), Polish UODO guidance.

### Phase 1 — Consolidation (blocked by all Phase-1 body sections)

- [x] research + write §9 (part 1) **Stripe-sufficiency verdict** — satisfies **FR-21**. 🔒 blocked by: §4, §5, §7, §8.
  *Answer:* one consolidated statement of what Stripe (Stripe Tax + Stripe invoices) genuinely
  handles end-to-end vs. every residual owner responsibility (VAT/OSS registration & filing,
  US/UK obligations, PL-compliant invoicing, KSeF). Convert scattered findings into a go/no-go
  picture. No new research — synthesize the sections above.

- [x] write §10 **What this changes for B-6** — satisfies **FR-23**. 🔒 blocked by: §6, §7, §9.
  *Answer:* a **checklist of go-live prerequisites in business terms** (not implementation
  instructions): required legal pages (ToS, privacy, withdrawal/refund policy, seller details);
  the withdrawal-consent/waiver step in checkout; VAT handling / Stripe Tax enablement in Checkout;
  invoice/receipt requirements; and any registration (JDG / VAT / OSS) that must exist before
  charging real customers. This is the actionable bridge the B-6 tech-lead consumes.

- [x] compile §11 **Consolidated open questions** — satisfies **FR-3**. 🔒 blocked by: all body sections.
  *Answer:* gather every inline "to be confirmed" flag into one section a reader can take into a
  paid consultation, and append the **5 carried owner open questions** below (each phrased as an
  owner-confirmable, with the working assumption stated).

- [x] compile §12 **Sources / references index** — supports **FR-2**. 🔒 blocked by: all research tasks.
  *Answer:* one retrievable link list (with date-checked for date-sensitive sources), so a reviewer
  can follow any citation. Verify no material claim in the doc lacks a corresponding entry.

### Phase 2 / 3 — Depth sections (schedule after Phase-1 unblocks B-6 planning)

- [x] research + write §3 (sp. z o.o. subsection) **When scale/risk pushes toward a limited company** — satisfies **FR-7** (Phase 3). 🔒 blocked by: §3 JDG subsection.
  *Answer:* concrete triggers that would make sp. z o.o. worth reconsidering — liability exposure,
  revenue level, tax efficiency (ZUS / składka zdrowotna at a descriptive level) — **without**
  recommending a switch. *Sources:* biznes.gov.pl (formy działalności), ZUS.
- [x] research + write §9 (part 2) **Merchant-of-Record comparison** — satisfies **FR-22** (Phase 2). 🔒 blocked by: §5, §9 part 1.
  *Answer:* compare Stripe-direct vs. an **MoR** (Paddle, Lemon Squeezy, etc.) where the MoR becomes
  seller-of-record and assumes worldwide tax/invoicing/consumer-law liability — trade-offs (cost,
  control, PL-specific fit). Present as an **informative alternative, not a switch recommendation**;
  note that adopting an MoR would materially change B-6. *Sources:* Paddle / Lemon Squeezy MoR docs,
  their tax/compliance pages.
- [ ] deepen the non-EU long tail if the owner names target countries (see Open Question 4) — otherwise leave §4 non-EU at the "described pattern + Stripe Tax coverage" depth. 🔒 blocked by: owner answer to OQ-4. **DEFERRED (2026-07-12):** owner confirmed US + UK in depth, rest as pattern — §4.4 left at pattern depth; box stays open pending an owner-named target country (§11 OQ-4).

### No refactoring / dependencies / migrations

- **Refactoring:** N/A — no code touched.
- **New dependencies:** none (no `.csproj` / `package.json` change).
- **EF migrations / Kiota regen / app build:** N/A — no schema, no controller/DTO, no app.

---

## 2. 🟠 Compliance / liability notes (analogous to the security section)

- **This document is not legal or tax advice.** 🟠 High.
  - [x] Verify §0 states this prominently *before any finding* and names the professionals
    (Polish accountant / księgowa; lawyer) who must validate it before the owner charges anyone.
- **No unconfirmed assumption may masquerade as settled fact.** 🟠 High.
  - [x] Verify every item dependent on the owner's specifics (revenue, residency, VAT status) or
    unbacked by a primary source lives in §11 open questions, not in findings.
- **Date-sensitive claims must be dated and flagged.** 🟠 High.
  - [x] Verify every threshold, rate, and especially **KSeF mandate dates** carry a date-checked and
    a "subject to change — confirm with accountant" flag (KSeF timelines have shifted repeatedly).
- **Professional validation gate before charging.** 🟠 High.
  - [x] Verify the doc states explicitly that it unblocks **B-6 planning** but that going **live**
    (charging real customers) waits on professional confirmation (owner OQ-1 assumption).
- **Citation integrity.** 🟡 Medium.
  - [x] Verify each material claim carries ≥1 retrievable citation; secondary-only claims are
    flagged lower-confidence; §12 index lets a reviewer follow any citation (FR-2).

## 3. 📈 Coverage / correctness considerations

- **Every FR maps to ≥1 section task.** 🟡 Medium.
  - [x] Traceability check (below) — confirm FR-1..FR-23 are each covered; no section is an
    unresolved question mislabelled as a finding (FR-3).
- **The Stripe calculate/collect vs register/file line.** 🟠 High (decision-critical).
  - [x] Verify §5 and §7 land every claim on the correct side of that line and cite Stripe's own
    docs for the "Stripe does X" half — this is where real cost/risk hides (FR-12, FR-17, FR-21).
- **Decision-usefulness over exhaustiveness.** 🟢 Low.
  - [x] Verify §9 verdict + §10 B-6 checklist + §11 open-questions are self-contained and
    actionable without reading the whole doc.

## 4. ❓ Open Questions (owner-confirmable — carried from requirements, unanswered at approval)

The owner accepted the requirements without resolving these five. The research doc must treat them
as owner-confirmables in §11; each task above uses the stated **working assumption** where it needs one.

1. **"Done" bar.** *Assumption:* a well-cited doc + consolidated open-questions list unblocks B-6
   **planning**; a professional consult is required before going **live** / charging. Confirm.
2. **Launch VAT posture.** *Assumption:* cross-border B2C digital sales likely force VAT/OSS
   registration early (no small-seller exemption from day one). Confirm — it affects launch timing.
3. **Merchant-of-Record appetite.** *Assumption:* keep Stripe as the baseline; the MoR comparison
   (§9 part 2) is an **informative alternative, not a switch**. Confirm Stripe is a firm constraint
   or the owner is open to an MoR if Stripe gaps prove significant.
4. **Jurisdiction depth.** *Assumption:* US + UK in depth; the long tail as a described pattern +
   Stripe Tax coverage. Confirm, or name specific countries warranting individual research (gates
   the Phase-2 depth task).
5. **Currency & pricing.** *Flag as an owner decision that interacts with VAT presentation and
   invoice requirements* (single currency vs localized) — may need settling before B-6.

_These are owner/professional confirmables, not blockers on producing the research doc itself. No
task should stall waiting on them except the Phase-2 long-tail deepening (OQ-4)._

---

## Traceability

FR-1 → §0 · FR-2 → §2 convention + §12 index (enforced across all sections) · FR-3 → §2 rule + §11 ·
FR-4 → §1 · FR-5,FR-6 → §3 · FR-7 → §3 sp. z o.o. subsection (Phase 3) · FR-8,FR-9,FR-10 → §4 EU ·
FR-11 → §4 non-EU · FR-12 → §5 · FR-13,FR-14,FR-15 → §6 · FR-16,FR-17 → §7 · FR-18 → §7 KSeF ·
FR-19,FR-20 → §8 · FR-21 → §9 part 1 · FR-22 → §9 part 2 (Phase 2) · FR-23 → §10. All 23 FRs mapped;
no task exists without a backing FR.
