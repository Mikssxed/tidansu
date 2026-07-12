# Poland payments — legal & compliance research (Tidansu Pro, worldwide sale via Stripe)

_Research deliverable for backlog item **B-5**. Gates B-6 (real Stripe go-live)._
_As-of date: **2026-07-12**. Author: feature-developer agent (research, not advice)._

---

## §0 · Disclaimer & professionals who must confirm this

> **⚠️ THIS IS RESEARCH TO INFORM A PROFESSIONAL CONSULTATION — IT IS NOT LEGAL OR TAX ADVICE.**
>
> Nothing in this document is a legal, tax, or accounting opinion, and nothing here
> may be relied on to charge real customers. It is a structured summary of publicly
> available primary sources, assembled so the owner can walk into a paid consultation
> with an informed agenda. **Every number, threshold, rate, and deadline below is "to
> be confirmed" unless it carries a cited primary source — and even cited figures must
> be re-checked at the moment of go-live, because tax law and especially KSeF timelines
> change.**
>
> Before Tidansu charges a single real customer, the following professionals must
> validate the relevant parts of this document against the owner's actual facts
> (residency, revenue, VAT status, exact product):
>
> - **A Polish accountant / księgowa (or licensed tax adviser / doradca podatkowy)** —
>   for business registration (JDG vs unregistered activity vs sp. z o.o.), VAT
>   registration and VAT-OSS, Polish invoice contents, KSeF applicability, and ZUS /
>   składka zdrowotna consequences.
> - **A lawyer (radca prawny / adwokat) with consumer-law + data-protection experience** —
>   for the Terms of Service, the right-of-withdrawal consent flow, mandatory
>   pre-purchase disclosures, the privacy policy, and the Stripe Data Processing
>   Agreement / international-transfer posture.
>
> **This document unblocks B-6 *planning*. It does NOT authorise going *live*.**
> Charging real customers waits on the professional confirmation above (see §11, OQ-1).

---

## §1 · Scope, assumptions & as-of date

This research is valid **only for the following fact pattern**. If any assumption is
wrong for the owner's real situation, the conclusions may not hold — that is exactly
what the professional in §0 is for.

| Assumption | Value |
|---|---|
| **Market** | **Worldwide** — sold to anyone on the internet (EU consumers + non-EU: US, UK, and the long tail). |
| **Business form** | **Sole trader — JDG** (jednoosobowa działalność gospodarcza) registered in Poland (CEIDG). Baseline; sp. z o.o. triggers noted in §3.4. |
| **Billing & invoicing system of record** | **Stripe** — specifically **Stripe Tax** (tax calculation/collection) + **Stripe Invoicing** (invoice/receipt generation). The owner's stated assumption is "Stripe does everything"; this document *validates* that assumption rather than re-opening it. |
| **Customer type** | **B2C** — consumers buying a **digital-services subscription** (Tidansu Pro). B2B (business buyers giving a VAT number) is a secondary case, noted where it changes the answer. |
| **Product** | A SaaS subscription — an **electronically supplied service** ("TBE": telecommunications, broadcasting & electronic) in EU-VAT terminology. |
| **As-of date** | **2026-07-12.** All date-sensitive figures reflect what was retrievable on this date. |

**Currency/pricing is not yet settled** (single currency vs localized) and interacts
with VAT presentation and invoicing — carried as an open question (§11, OQ-5).

---

## §2 · How to read this doc — findings vs open questions, citation convention

**Citation convention.** Every material claim (a threshold, rate, obligation, deadline,
or a "Stripe does X") carries at least one bracketed source id like `[S3]` that resolves
in **§12 · Sources index**. Sources fetched and read during this research are marked
"retrieved 2026-07-12"; date-sensitive claims additionally carry the check date inline.
**Primary/authoritative sources are preferred** (EU legislation, Polish tax-authority
portals, HMRC/US DOR, official Stripe docs). Where only a secondary source was available,
or where a canonical portal page could not be retrieved in this session, the claim is
explicitly flagged **(lower-confidence — verify)**.

**Findings vs open questions (hard rule).** A statement appears as a **finding** only if
it is backed by a cited primary source *and* does not depend on the owner's private facts.
Anything that (a) depends on the owner's specifics (actual revenue, residency details,
chosen VAT status, target countries), or (b) is not backed by a retrievable primary
source, or (c) is a date that is known to shift (KSeF!) — lives in **§11 · Consolidated
open questions**, never in a findings section. Inline, such items are tagged
**→ OQ** and gathered into §11.

---

## §3 · Business registration in Poland — JDG, unregistered activity, sp. z o.o.

### 3.1 Registering a JDG to sell SaaS worldwide — what it entails

**Finding.** A sole trader registers a JDG through **CEIDG** (Centralna Ewidencja i
Informacja o Działalności Gospodarczej), the free, online business register run via
biznes.gov.pl; registration in CEIDG is the act that creates the business and is
required before invoicing in the course of business [S10]. On registration the owner:

- selects **PKD activity codes** (Polska Klasyfikacja Działalności). For software/SaaS
  the descriptively-relevant codes are around **62.01.Z** ("computer programming
  activities") and **63.12.Z** ("web portals") / **62.09.Z**; the exact code set is an
  accountant question, not a blocker **(lower-confidence on the precise codes — verify with accountant)** [S10]. **→ OQ**
- is assigned obligations from day one: **income-tax** registration (the JDG's income is
  the owner's; taxed under the chosen form — scale/ryczałt/flat — an accountant decision),
  **ZUS** social-security/health contributions, and **record-keeping**.
- must decide **VAT status** *before* selling cross-border digital services — see §4.
  Being able to issue VAT-compliant invoices and to remit VAT (domestically or via OSS)
  is a prerequisite that attaches essentially at launch for this business model.

**Finding.** There is **no minimum-capital requirement** for a JDG, and the trader has
**unlimited personal liability** for business debts (the key contrast with sp. z o.o.,
§3.4) [S10][S20].

The concrete *filing* steps (which CEIDG form, ZUS codes, tax-form election) are
deliberately out of scope here — they are the accountant's tutorial, not this document's.
**What matters for B-6:** a registered JDG that can issue compliant invoices and handle
VAT must exist before charging real customers.

### 3.2 The unregistered-activity path (działalność nierejestrowana) — viable?

**Finding — NOT viable for this business.** Polish law allows small-scale activity
*without* registering a business ("działalność nierejestrowana") as long as monthly
revenue stays under a cap defined as **75% of the minimum wage** (a moving figure —
roughly PLN 3,000–3,500/month in 2025–2026; the *exact* current amount is a
**date-sensitive, to-confirm** number) [S10]. **→ OQ (exact current cap)**

However, the unregistered path **collides with the VAT/OSS obligations** of selling
digital services cross-border:

- Selling **electronically supplied services to consumers in other EU countries** puts VAT
  in the *customer's* country and, once the €10,000 EU-wide threshold is crossed (or once
  the seller voluntarily opts in), requires **VAT-OSS registration** (§4.2). VAT
  registration/identification and the associated invoicing obligations are hard to
  reconcile with running "unregistered." **(lower-confidence on the precise
  interaction — this is exactly a księgowa question)** [S1][S11] **→ OQ**
- The revenue cap is *monthly and low*; a worldwide paid SaaS is intended to exceed it.

**Verdict:** treat działalność nierejestrowana as **not viable** for worldwide B2C SaaS.
The JDG is the correct baseline. (The owner already chose JDG; this confirms it.)

### 3.3 (placeholder — see 3.4 for sp. z o.o. triggers)

### 3.4 When scale/risk pushes toward a limited company (sp. z o.o.) — triggers, not a recommendation

**Finding — presented as signals, not a recommendation to switch.** A JDG is the launch
baseline. The concrete triggers that would make **sp. z o.o.** (spółka z ograniczoną
odpowiedzialnością) worth *reconsidering* with the accountant/lawyer are [S10][S20]:

- **Liability exposure.** A JDG owner is personally liable with all personal assets for
  business debts; an sp. z o.o. is a separate legal person whose shareholders' liability
  is in principle limited to their contribution. As customer numbers, contractual
  exposure, or data-breach risk grow, this becomes the dominant trigger [S20].
- **Revenue / tax efficiency.** At higher profit levels the JDG's personal-tax +
  **składka zdrowotna** (health contribution, which since the "Polski Ład" reforms scales
  with income for many JDG taxation forms) can become less efficient than an sp. z o.o.'s
  corporate structure (CIT, incl. the "Estonian CIT" regime for some). The exact
  cross-over point is entirely an accountant's calculation on real numbers
  **(descriptive only — verify)** [S20]. **→ OQ**
- **Investment / co-founders / credibility.** Taking on a partner, outside investment, or
  larger B2B contracts often pushes toward sp. z o.o.
- **Downsides to weigh:** full accounting (pełna księgowość), higher setup/running cost,
  and — for a single-member sp. z o.o. — ZUS treatment similar to a sole trader.

**No switch is recommended here.** JDG launches; revisit if the triggers above fire.

---

## §4 · VAT & tax obligations

### 4.1 Place of supply for B2C digital services (the root rule) — FR-8

**Finding.** For **B2C telecommunications, broadcasting and electronically supplied
services** (which a SaaS subscription is), the **place of supply is where the *customer*
is established/resident** — i.e. VAT is due in the **customer's country**, at the
customer's country's rate ("destination-based VAT") [S1][S2]. This is the root of nearly
every downstream obligation.

**Consequence for pricing/collection.** The correct VAT rate varies per customer country
(e.g. standard rates differ across the EU, ~17–27%). The seller must **determine each
customer's location** (EU rules require corroborating evidence of location) and charge the
right rate. This is precisely the work **Stripe Tax automates on the calculation side**
(§5) [S3]. Practically, worldwide B2C pricing must decide whether the displayed price is
**VAT-inclusive** (common and often required for consumer-facing EU pricing — see §6.2)
and let the tax engine break out the destination VAT.

### 4.2 EU OSS (One-Stop-Shop) and the €10,000 micro-threshold — FR-9

**Finding.** The **Union OSS scheme** lets a business established in the EU register in a
**single** EU country (for a PL business, Poland) and, through **one quarterly OSS return
and one payment**, remit the VAT due across *all* other EU member states for its
cross-border B2C supplies — instead of registering for VAT in every customer country.
The scheme charges VAT at the customer's country rate and requires keeping records for
**up to 10 years** [S1] (retrieved 2026-07-12).

**The €10,000 micro-business threshold.** For a seller established in **one** EU country,
cross-border B2C supplies of TBE/digital services are taxed in the *home* country (at
home rates) **until total cross-border EU sales exceed EUR 10,000 in a calendar year**;
above that, destination-country VAT (via OSS or local registration) applies. Below the
threshold the seller *may* still opt into destination taxation/OSS voluntarily [S5]
(Stripe's own EU guidance states registration "isn't required if … your total sales
across the EU are below 10,000 EUR in a calendar year" for digital products — retrieved
2026-07-12) [S1][S5].

**Interaction with the JDG & the launch decision.** A "worldwide from day one" seller
who markets to all of the EU is realistically expected to cross €10,000 quickly, and may
prefer to **register for VAT-OSS in Poland from launch** to charge correct destination
VAT via Stripe rather than switch mid-year. **Whether the owner is comfortable
registering for OSS early (removing reliance on the €10k grace) is an owner posture
decision** — carried as **→ OQ** (§11, OQ-2). OSS registration in Poland is done through
the Polish tax administration; a JDG can register for OSS **(procedural detail — confirm
with księgowa)** [S11].

### 4.3 PL VAT registration & status — FR-10

**Finding — with an important nuance to confirm.** Poland has a **domestic VAT-exemption
threshold** ("zwolnienie podmiotowe") of **PLN 200,000** of annual turnover, below which a
small business need not be an active VAT payer (art. 113 ustawy o VAT) [S9]. **However**,
this exemption governs **domestic PL** supplies. Two things complicate it for this
business:

1. **Cross-border EU B2C digital sales are taxed in the customer's country** (§4.1) and go
   through **OSS**, which is a *separate* registration from being a Polish "active VAT
   payer" — a business can in principle be domestically VAT-exempt yet use OSS for its EU
   sales. **Whether the owner can/should remain a "podatnik zwolniony" domestically while
   running OSS, or should register as an active VAT payer, is a genuine księgowa
   question** and depends on real numbers and input-VAT recovery goals **(lower-confidence
   — verify)** [S9][S11]. **→ OQ**
2. Certain services are **excluded from the domestic exemption** (art. 113 ust. 13); an
   accountant must confirm whether Tidansu's supply falls in an excluded category.

**Working conclusion (to confirm):** for a worldwide B2C digital-services seller, expect
**VAT-OSS registration to be required** once EU cross-border sales exceed €10,000 (§4.2),
and expect the domestic PLN 200,000 exemption to be **largely irrelevant to the
cross-border obligation** even if it still shelters purely-domestic sales. The single
most launch-relevant fact: **cross-border digital B2C sales create a VAT/OSS obligation
that revenue size does not excuse.** Confirm the owner's exact VAT posture with the
accountant. **→ OQ (OQ-2)**

### 4.4 Non-EU tax obligations (US in depth, UK in depth, long tail as a pattern) — FR-11

**United States — sales tax economic nexus (in depth).**
**Finding.** The US has **no federal VAT**; sales/use tax is **state-level** (and
sometimes local). Since *South Dakota v. Wayfair* (2018), a state may require an
out-of-state seller with **no physical presence** to collect its sales tax once the seller
crosses that state's **economic-nexus threshold** — commonly modelled on **USD 100,000 in
sales OR 200 transactions** into the state per year, though **thresholds and rules vary by
state** (some dropped the transaction count; amounts differ) [S16]. **Taxability of SaaS
itself varies by state** — some states tax SaaS/digital services, others don't [S16].
Consequence: obligations can arise in *individual states* purely from remote sales volume,
each with its own registration + filing. **(US state specifics are a moving, per-state
matter — verify the states that actually matter once real sales data exists.)** **→ OQ**

**United Kingdom — VAT on B2C digital services (in depth).**
**Finding.** Post-Brexit, a business **not established in the UK** that supplies **B2C
digital services to UK consumers** is generally required to **register for UK VAT and
account for UK VAT from the first such sale** — there is **no registration threshold** for
non-established sellers making these supplies (the £85k/£90k threshold applies to
UK-established businesses, not to non-established digital-service sellers) [S15]. So a PL
seller reaching UK consumers should expect a **UK VAT registration + UK VAT returns**
obligation essentially from the first UK sale **(confirm current HMRC position — retrieved
guidance basis)** [S15].

**Long tail (described pattern, not enumerated).**
**Finding.** Many non-EU jurisdictions have adopted the same "tax digital services where
the consumer is" model, each with its own registration/threshold, e.g. **Canada** (GST/HST
+ some provincial), **Australia** (GST, AUD 75,000 registration threshold for remote
sellers), **Norway** (VOEC), **Switzerland**, and a growing list in Asia/LatAm [S3][S16].
Per the owner's decision (OQ-4), these are **not** deep-dived individually — they are
handled by describing the pattern and deferring specifics to **Stripe Tax's jurisdiction
coverage** (§5) and professional advice. **→ OQ-4** (owner may name target countries later).

---

## §5 · Stripe Tax gap analysis — calculate/collect vs register/file (THE CRUX) — FR-12

**The line that matters.** Stripe Tax **calculates** the right tax and **collects** it at
checkout, and it **monitors** where you may need to register — but **registering** and
**filing/remitting** returns remain the **seller's legal responsibility** unless the owner
buys Stripe's/partners' *paid* filing add-ons. In Stripe's own words: *"You must file and
remit the tax you collect for every location where you're registered"* [S4] (retrieved
2026-07-12). Stripe Tax "monitors your obligations" and helps you "**identify where you
might need to register**," and you "**register to collect taxes**" — Stripe can register on
your behalf as an add-on, but the *obligation* is yours [S3][S19] (retrieved 2026-07-12).
Automated **filing** is offered by Stripe **in the US**, and elsewhere **through filing
partners** (e.g. **Taxually**) — i.e. a *separate, paid* capability, not something included
automatically in every jurisdiction [S4] (retrieved 2026-07-12).

**Per-jurisdiction gap table** (✓ = Stripe does it; ✗ = remains the owner's job / needs a
paid add-on):

| Jurisdiction | Calculation (Stripe) | Collection (Stripe) | Registration | Filing / remittance |
|---|---|---|---|---|
| **Poland (domestic PL VAT)** | ✓ Stripe Tax calculates PL VAT [S3] | ✓ collects at checkout | ✗ **Owner** registers status with PL tax authority [S11] | ✗ **Owner** files PL VAT returns (JPK_V7) — Stripe does not file PL domestic returns [S4] |
| **EU cross-border (VAT-OSS)** | ✓ calculates destination-country VAT [S3][S5] | ✓ collects | ✗ **Owner** registers for **OSS in Poland** [S1][S11] | ✗ **Owner** files the quarterly OSS return — or buys a filing partner (Taxually) via Stripe [S4] |
| **United Kingdom** | ✓ calculates UK VAT [S3] | ✓ collects | ✗ **Owner** registers for **UK VAT** (from first B2C digital sale) [S15] | ✗ **Owner** files UK VAT returns (or via partner) [S4] |
| **United States (per state)** | ✓ calculates state/local sales tax where taxable [S3][S16] | ✓ collects | ✗ **Owner** registers per state where nexus is triggered [S16]; Stripe can register on owner's behalf (paid) [S3] | ~ Stripe offers **automated US filing** (paid) [S4]; otherwise owner/partner files |
| **Long-tail non-EU** | ✓ where Stripe Tax supports the country [S3] | ✓ | ✗ owner registers | ✗ owner/partner files |

**Residual owner responsibilities (the gap):** OSS registration + quarterly OSS filing;
PL domestic VAT registration + JPK_V7 filing (if an active VAT payer); UK VAT registration
+ filing; US per-state registration + filing (or pay Stripe's US filing / registration
add-ons); monitoring long-tail thresholds Stripe surfaces and acting on them.

**Bottom line for the crux:** Stripe Tax **substantially closes the *calculation and
collection* gap worldwide**, and Stripe **monitors** thresholds — but the **"Stripe does
everything" assumption fails on registration and filing**, which stay with the owner
unless paid filing add-ons/partners are engaged (and even those don't cover every
jurisdiction). This is where the real ongoing cost/effort and compliance risk sit. See
the consolidated verdict in §9.

---

## §6 · Consumer protection — withdrawal right, disclosures, ToS/legal pages

### 6.1 The 14-day right of withdrawal + the express-consent waiver for digital services — FR-13

**Finding (EU).** Under the **Consumer Rights Directive 2011/83/EU** (transposed in
Poland by the **Ustawa o prawach konsumenta**), a consumer buying at a distance generally
has a **14-day right of withdrawal** [S7][S8]. For **digital content/services supplied
immediately (before the 14 days elapse)**, the trader may start performance during the
withdrawal period and the consumer **loses the withdrawal right** **only if** the trader
obtains, *before* performance begins, the consumer's **express prior consent** to begin
**and** the consumer's **acknowledgement that they thereby lose the right of withdrawal**
(CRD Arts 9, 14, and the **Art. 16(m)** digital-content exception) [S7][S8].

**What Tidansu must capture at checkout (business terms).** A **checkbox / affirmative
step** where the consumer, before Pro activates, both:
1. **expressly consents** to immediate provision of the Pro service, and
2. **acknowledges that by doing so they lose the 14-day right to withdraw.**
Without both, the consumer could **use Pro and still demand a full refund within 14 days**.
This becomes a concrete **B-6 checkout requirement** (§10). The exact wording should be
lawyer-reviewed **→ OQ**.

**UK divergence (flag).** The UK's **Consumer Contracts Regulations 2013** contain an
equivalent 14-day withdrawal right and an equivalent express-consent/acknowledgement
carve-out for digital content supplied immediately — mechanically similar but a **separate
legal basis** post-Brexit; confirm the UK wording separately [S18]. **→ OQ**

### 6.2 Mandatory pre-purchase disclosures — FR-14

**Finding.** Before the consumer is bound, the trader must clearly provide (CRD Art. 6;
Ustawa o prawach konsumenta) [S7][S8]:

| Disclosure | Where it must appear |
|---|---|
| **Total price including VAT** (and that it's per period for a subscription) | Checkout, before payment |
| **Subscription / auto-renewal terms & duration**, and minimum commitment | Checkout + ToS |
| **Seller identity + contact** (trading name, JDG owner, geographic + email address) | Checkout/footer + ToS/imprint |
| **Main functionality, and any interoperability / technical-protection** of the digital service | Product/checkout + ToS |
| **How to cancel** and how to exercise (or that they waive) the withdrawal right | Checkout + ToS/withdrawal policy |
| **Payment, and confirmation** of the contract on a durable medium after purchase | Post-purchase email/receipt |

The **"confirm order" button must make clear it entails an obligation to pay** (the
"button labelling" rule — e.g. "Subscribe & pay") [S7]. Exact copy is lawyer-reviewed **→ OQ**.

### 6.3 ToS / legal-page obligations — FR-15

**Finding.** A paid EU-facing SaaS should publish, and make accessible **before**
purchase [S7][S8]:

- **Terms of Service / Regulamin** — parties & seller identity; description of Pro; price
  & renewal; payment (Stripe); the withdrawal right + the immediate-performance waiver;
  cancellation; liability & warranties; complaints procedure; governing law; changes to
  terms.
- **Privacy Policy** (see §8).
- **Withdrawal / refund policy** (the §6.1 rules made consumer-readable; include the
  model withdrawal form reference per CRD).
- **Seller / imprint details** (JDG owner, NIP, address, contact) accessible site-wide.

These pages are a **hard prerequisite** for B-6 (§10). Their **drafting is out of scope**
here (downstream lawyer task).

---

## §7 · Invoicing — PL requirements, Stripe sufficiency, KSeF

### 7.1 Mandatory Polish invoice contents & issuance/retention — FR-16

**Finding.** A VAT invoice under Polish law (**art. 106e ustawy o VAT**) must contain,
among others [S9]:

- issue date; a **sequential invoice number** under one or more series;
- **seller** name/address and **NIP**; **buyer** name/address (and NIP for B2B);
- date of supply/payment if different from issue date;
- **description** of the service, quantity;
- **net unit price**, net amount, **VAT rate(s)**, VAT amount, and **gross total**;
- amounts may be in a foreign currency but the **VAT amount must be shown in PLN** for
  domestic PL VAT (with the correct conversion rule) **(confirm presentation rules for
  OSS vs domestic — księgowa)** [S9]. **→ OQ**

**Issuance/retention.** For **B2C**, an invoice generally need only be issued **on the
consumer's request** (a receipt/record otherwise), but many sellers issue one per
transaction; **B2B always requires an invoice**. Invoices/records must be **retained**
(commonly ~5 years from the end of the tax year, and OSS records **up to 10 years** [S1])
**(confirm exact retention with accountant)** [S9][S1]. **→ OQ**

### 7.2 Are Stripe-generated invoices sufficient? — FR-17

**Finding — sufficient on core fields, with gaps to confirm.** **Stripe Invoicing** can
generate branded **PDF invoices/receipts** with **sequential numbering**, seller **account
tax IDs**, **customer tax IDs**, line items, tax breakdown, currency, and **localized**
emails/PDFs, and integrates with Stripe Tax's VAT breakdown [S14] (retrieved 2026-07-12).
On the **field checklist of §7.1, Stripe can be configured to carry the mandatory data**.

**Likely gaps / things to verify against §7.1:**
- **PLN presentation of the VAT amount** for domestic PL VAT (Stripe presents tax in the
  charge currency; Polish rules may require the VAT amount in PLN) **→ OQ** [S9][S14].
- **Numbering series** must be gapless per Polish expectations — confirm Stripe's numbering
  scheme satisfies this for a PL VAT payer **→ OQ**.
- **Language** — Polish authorities generally accept invoices in another language, but
  confirm for audits **→ OQ**.
- **KSeF structured-format** submission (§7.3) — Stripe PDFs are **not** the KSeF XML.

**Verdict:** Stripe invoices are **likely sufficient as the consumer-facing invoice/receipt**
for a PL JDG, **but not automatically KSeF-compliant**, and the PLN-VAT-presentation and
numbering points need a księgowa's sign-off. A **separate Polish invoicing/KSeF
integration may be required** (see §7.3) — this is a real potential **extra tool before
go-live**. **→ OQ**

### 7.3 KSeF (Krajowy System e-Faktur) — direction & timeline — FR-18

**Finding — mandatory e-invoicing is arriving in 2026; DATES ARE VOLATILE.** KSeF is
Poland's **national e-invoicing system**; structured invoices are issued/received through
a central government platform. Mandatory KSeF has been **repeatedly delayed**, and the
currently-communicated phased schedule brings it into force in **2026** [S6].

> **⚠️ DATE-SENSITIVE — SUBJECT TO CHANGE — CONFIRM WITH ACCOUNTANT (checked 2026-07-12).**
> The KSeF portal (ksef.podatki.gov.pl / podatki.gov.pl/ksef) was in **active/partial
> rollout in mid-2026** as of the check date — the portal was publishing "KSeF 2.0" go-live
> material and **post-partial-implementation consultation notices dated June 2026** [S6]
> (retrieved 2026-07-12). The widely-communicated phased mandate has large taxpayers
> (2024 turnover above ~PLN 200 million) onboarding first, followed by all other VAT
> taxpayers, with the smallest taxpayers phased slightly later. **The precise date that
> applies to a small JDG must be confirmed with the accountant — do not hard-code it.**
> **→ OQ**

**Implication for Stripe-based invoicing.** Because KSeF requires invoices in a
**structured XML format submitted to the government platform**, **Stripe's PDF invoices do
not by themselves satisfy KSeF** once the mandate applies to the JDG. The owner will
likely need a **KSeF integration/tool** that takes the billing data (from Stripe) and
files structured invoices to KSeF — a concrete potential **B-6-adjacent dependency**.
Confirm scope and timing with the accountant. **→ OQ**

---

## §8 · GDPR for a paid app — Stripe as processor, RoPA, transfers, privacy policy

### 8.1 Obligations that arise specifically from taking payments — FR-19

**Finding.** Introducing Stripe adds a new **processor** and new categories of personal
data (billing/payment data), triggering:

- **Stripe as a processor → Data Processing Agreement (Art. 28 GDPR).** The controller
  (the owner/Tidansu) must have a **DPA** in place with Stripe. **Stripe provides a DPA**
  as part of its Services/Legal terms [S12] (retrieved 2026-07-12), which incorporates the
  required Art. 28 processor terms and **Standard Contractual Clauses** for transfers.
  Confirm the owner accepts/executes Stripe's DPA and reviews Stripe's **sub-processor
  list** [S12]. **→ OQ (execution/acceptance)**
- **Records of Processing (RoPA, Art. 30).** Add entries for **payment/billing processing**:
  purpose (taking subscription payments), data categories (name, email, billing address,
  card metadata/token — note Stripe, not Tidansu, handles PAN), the Stripe processor, and
  retention [S13].
- **International transfers (Arts 44–49).** Stripe processes data on infrastructure that
  may involve transfers outside the EEA (Stripe operates via EU and US entities); reliance
  is on **SCCs** in Stripe's DPA [S12][S13]. Consistent with the owner's GDPR-friendly-
  provider preference, confirm **which Stripe entity is the contracting party for a PL
  business and the data-location/transfer posture** — this is a lawyer/DPO check. **→ OQ**

### 8.2 Privacy-policy additions for a paid app — FR-20

**Finding.** Before charging, the privacy policy must be updated to disclose [S13][S12]:

- **Stripe as the payment processor** (named), acting as a processor/independent
  controller for its own fraud/compliance purposes as applicable;
- **what billing data is processed and why** (name, email, billing address, transaction
  metadata; card data handled by Stripe/PCI, not stored by Tidansu);
- **legal basis** (contract performance for the paid service; legal obligation for
  tax/invoice retention);
- **retention** (invoice/tax records kept for the statutory period — tie to §7.1);
- **international-transfer** disclosure (Stripe, SCCs);
- **data-subject rights** and how to exercise them.

This makes the privacy policy **B-6-ready**; **drafting is a downstream lawyer task**.

---

## §9 · Stripe-sufficiency verdict & Merchant-of-Record comparison

### 9.1 Consolidated Stripe-sufficiency verdict — FR-21

**Verdict: "Stripe does everything" is TRUE for calculation, collection, and
invoice/receipt *generation* — but FALSE for tax registration and filing/remittance, and
for KSeF.** Stripe is a strong billing/tax-engine of record, **not** a complete compliance
outsource.

**What Stripe (Stripe Tax + Stripe Invoicing) genuinely handles end-to-end:**
- ✓ Determining customer location and **calculating** the correct VAT/sales tax per
  jurisdiction [S3].
- ✓ **Collecting** the tax at checkout on subscriptions [S3].
- ✓ **Monitoring** where the owner may need to register (threshold tracking) [S3].
- ✓ Generating **PDF invoices/receipts** with the mandatory data fields, numbering, tax IDs,
  and localization [S14].
- ~ **Optionally** registering on the owner's behalf and **filing** — **US automated filing**
  and **partner filing (e.g. Taxually) elsewhere**, as *paid* add-ons [S3][S4].

**What remains the owner's responsibility (the residual list for go-live):**
- ✗ **Register for VAT-OSS in Poland** and **file the quarterly OSS return** [S1][S11].
- ✗ **PL domestic VAT** status decision + **JPK_V7 filing** if an active VAT payer [S9][S11].
- ✗ **UK VAT** registration + filing (from first UK B2C digital sale) [S15].
- ✗ **US** per-state registration + filing where economic nexus triggers [S16] (unless the
  paid Stripe US filing/registration add-ons are used [S3][S4]).
- ✗ **KSeF** structured e-invoicing once the mandate applies — a likely **separate tool** [S6].
- ✗ **PLN VAT presentation / numbering** confirmation on invoices [S9].
- ✗ **Legal pages, withdrawal-consent flow, DPA execution, privacy policy** (§6, §8).

**Go/no-go picture:** Stripe **can be the billing system of record**, but the owner must
also stand up **OSS registration + filing**, a **KSeF path**, and the **legal/consumer
layer** before charging. None of these is a blocker to *building* B-6; all are blockers to
*going live*.

### 9.2 Merchant-of-Record (MoR) comparison — informative alternative, not a switch — FR-22

**Finding — presented as a trade-off, not a recommendation.** A **Merchant-of-Record**
(e.g. **Paddle**, **Lemon Squeezy**) becomes the **legal seller/reseller of record** and
therefore assumes worldwide **tax calculation, collection, registration, filing/remittance,
invoicing, and much consumer-law liability** on the owner's behalf [S17].

| Dimension | **Stripe-direct** (current assumption) | **Merchant-of-Record** (Paddle / Lemon Squeezy) |
|---|---|---|
| Who is seller of record | **The owner (JDG)** | **The MoR** |
| VAT/sales-tax registration & filing | **Owner's job** (OSS, UK, US…) [S1][S15][S16] | **MoR handles worldwide** [S17] |
| Invoicing incl. KSeF | Owner ensures PL/KSeF compliance (§7) | MoR issues invoices as seller (PL/KSeF relationship differs — **verify**) [S17] |
| Consumer-law liability | Owner | Largely MoR |
| Cost | Lower % + owner does filing (or pays add-ons) | **Higher %** (MoR fee bundles compliance) |
| Control / flexibility | High (full Stripe API/checkout) | Lower (MoR-mediated) |
| PL-specific fit | Owner must solve PL VAT/KSeF | MoR may simplify — **but confirm how a PL JDG's own tax position interacts with an MoR** [S17] |

**When an MoR becomes attractive:** if the §5/§7.3 gaps (OSS + UK + US filing + KSeF) prove
too costly/complex to run as a solo JDG, an MoR trades margin for near-complete compliance
outsourcing. **Adopting an MoR would materially change B-6** (different checkout, different
invoicing, the owner is no longer seller-of-record). **The owner's appetite for an MoR is
an open question (§11, OQ-3)** — the baseline remains Stripe-direct.

---

## §10 · What this changes for B-6 — go-live prerequisites checklist

A business-language checklist the B-6 tech-lead consumes. **These gate flipping Stripe to
live — not the B-6 build itself.**

**A. Registration & tax (must exist before charging):**
- [ ] JDG registered in CEIDG and able to issue compliant invoices (§3.1).
- [ ] **VAT-OSS registered in Poland** (or a confirmed decision to rely on the €10k grace
      short-term) — determines whether Checkout charges destination VAT from day one (§4.2, OQ-2).
- [ ] PL VAT status decided with accountant (active payer vs zwolniony + OSS) (§4.3).
- [ ] Decision on UK/US: register when triggered, or rely on Stripe's paid registration/filing
      add-ons (§4.4, §5).

**B. Stripe configuration:**
- [ ] **Stripe Tax enabled** in Checkout so destination VAT/sales tax is **calculated &
      collected** per customer location (§4.1, §5).
- [ ] **Stripe Invoicing configured** to emit compliant invoices/receipts (numbering,
      seller NIP, customer tax ID capture, VAT breakdown, localization) — with the
      **PLN-VAT-presentation** and numbering points confirmed by the księgowa (§7.2).
- [ ] Decide whether to buy Stripe's/partners' **filing** add-ons or file OSS/UK/US
      returns manually (§5).

**C. Invoicing / KSeF:**
- [ ] Plan for **KSeF** structured e-invoicing (likely a separate integration) with a date
      confirmed for when it applies to the JDG (§7.3, OQ). **Do not assume Stripe PDFs
      satisfy KSeF.**

**D. Consumer-law checkout requirements:**
- [ ] **Withdrawal-consent + acknowledgement waiver** step in Checkout (express consent to
      immediate provision + acknowledgement of losing the 14-day right) before Pro activates (§6.1).
- [ ] All **mandatory pre-purchase disclosures** shown at checkout (total price incl. VAT,
      renewal terms, seller identity, functionality, cancellation) and a **"Subscribe & pay"**
      obligation-to-pay button (§6.2).

**E. Legal pages live & accessible before purchase:**
- [ ] **Terms of Service / Regulamin** (paid-subscription content) (§6.3).
- [ ] **Privacy Policy** updated for payments / Stripe processor / transfers (§8.2).
- [ ] **Withdrawal / refund policy** (§6.3).
- [ ] **Seller/imprint details** (JDG owner, NIP, address, contact) site-wide (§6.3).

**F. GDPR:**
- [ ] **Stripe DPA** accepted/executed and sub-processor list reviewed (§8.1).
- [ ] **RoPA** updated with payment/billing processing; transfer posture (SCCs) confirmed (§8.1).

**Go-live gate:** none of A–F is an implementation blocker for building B-6, but **all**
must be satisfied (and the §11 open questions professionally confirmed) before charging a
real customer.

---

## §11 · Consolidated open questions for a Polish accountant / lawyer

Everything below is **unconfirmed** or **owner-specific** — take this list into the paid
consultation. Grouped; the last five are the carried owner open questions with their
working assumptions.

**Tax / accountant (księgowa / doradca podatkowy):**
1. Exact **PKD code set** for the SaaS activity (§3.1).
2. Exact current **działalność nierejestrowana cap** (75%-of-minimum-wage figure) — and
   confirmation it is not viable here (§3.2).
3. Whether the JDG can/should stay **domestically VAT-exempt (zwolniony) while using OSS**,
   or must register as an **active VAT payer**; effect on input-VAT recovery (§4.3).
4. Whether Tidansu's supply is in an **art. 113 ust. 13 excluded** category (§4.3).
5. **OSS registration** procedure & timing for a JDG; whether to register from launch (§4.2).
6. **PLN VAT-amount presentation** and **numbering** rules for Stripe invoices; language
   acceptability; exact **retention** period (§7.1, §7.2).
7. **KSeF** — the precise **date the mandate applies to a small JDG**, and the required
   integration path given Stripe PDFs are not KSeF XML (§7.3). *Date volatile — re-confirm.*
8. **US** states that actually matter once sales data exists, and **UK VAT** registration
   trigger/timing confirmation (§4.4).
9. **sp. z o.o. cross-over** point on real numbers (liability/tax) — if/when to revisit (§3.4).

**Legal (lawyer — consumer + data protection):**
10. Exact **withdrawal-consent + acknowledgement wording** at checkout (EU + UK variants) (§6.1).
11. Exact **pre-purchase disclosure copy** and **button labelling** (§6.2).
12. **ToS / withdrawal / refund** page contents for a paid EU-facing SaaS (§6.3).
13. **Stripe DPA** acceptance, **contracting entity** for a PL business, **transfer/SCC**
    posture, **sub-processor** review, **privacy-policy** additions (§8).

**Carried owner open questions (with working assumptions):**
- **OQ-1 — "Done" bar.** *Assumption:* this well-cited doc + this open-questions list
  unblocks **B-6 planning**; a professional consult is required before going **live** /
  charging. **Confirm.**
- **OQ-2 — Launch VAT posture.** *Assumption:* cross-border B2C digital sales likely force
  **VAT/OSS registration early** (no small-seller shelter from the cross-border obligation);
  affects launch timing. **Confirm.**
- **OQ-3 — Merchant-of-Record appetite.** *Assumption:* keep **Stripe as baseline**; the §9.2
  MoR comparison is an informative alternative, not a switch. **Confirm Stripe is firm, or
  that the owner is open to an MoR if the §5/§7.3 gaps prove significant.**
- **OQ-4 — Jurisdiction depth.** *Assumption:* **US + UK in depth; long tail as a described
  pattern + Stripe Tax coverage.** **Confirm, or name specific countries** warranting
  individual research (would re-open the deferred long-tail depth task).
- **OQ-5 — Currency & pricing.** *Flag:* single currency vs localized pricing interacts with
  **VAT presentation** and **invoice requirements**; may need settling **before B-6**.

---

## §12 · Sources / references index

Primary/authoritative sources. "retrieved 2026-07-12" = fetched and read during this
research; others are canonical primary sources (legislation / tax-authority / official
docs) cited by their authoritative location — where a deep portal page could not be
retrieved in this session it is flagged and the related claim marked lower-confidence.

| id | Source | Reference | Notes |
|---|---|---|---|
| **S1** | European Commission — Your Europe: **EU VAT One Stop Shop (OSS)** | https://europa.eu/youreurope/business/taxation/vat/vat-digital-services-moss-scheme/index_en.htm | retrieved 2026-07-12 — OSS mechanism, destination VAT, one return/payment, 10-yr records |
| **S2** | **Council Directive 2006/112/EC** (EU VAT Directive) — place of supply, Arts 44 & 58 (B2C TBE services) | EUR-Lex: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02006L0112 | primary legislation; place-of-supply basis |
| **S3** | **Stripe Tax** — product overview ("How Stripe Tax works", monitor/register/file) | https://docs.stripe.com/tax | retrieved 2026-07-12 — calculate/collect + monitor; registration on your behalf (paid) |
| **S4** | **Stripe Tax — File and remit** | https://docs.stripe.com/tax/filing | retrieved 2026-07-12 — "You must file and remit … for every location where you're registered"; US automated filing + partners (Taxually) |
| **S5** | **Stripe Tax — EU / supported countries** | https://docs.stripe.com/tax/supported-countries/european-union | retrieved 2026-07-12 — €10,000 EU small-seller threshold for digital products |
| **S6** | **KSeF official portal** (Ministry of Finance) | https://www.podatki.gov.pl/ksef/ ; https://ksef.podatki.gov.pl | retrieved 2026-07-12 — active/partial rollout mid-2026; June 2026 consultation notices. **Dates volatile — confirm.** |
| **S7** | **Directive 2011/83/EU** (Consumer Rights Directive) — Arts 6, 8, 9, 14, 16(m) | EUR-Lex: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011L0083 | withdrawal right + digital-content express-consent waiver + disclosures |
| **S8** | **Ustawa o prawach konsumenta** (PL transposition), UOKiK guidance | isap.sejm.gov.pl (Dz.U. 2014 poz. 827); https://uokik.gov.pl | Polish consumer law; deep page not retrieved this session |
| **S9** | **Ustawa o VAT** — art. 106e (invoice contents), art. 113 (PLN 200k exemption) | isap.sejm.gov.pl (Dz.U. 2004 nr 54 poz. 535) | invoice fields + domestic exemption; deep page not retrieved this session — figures to confirm |
| **S10** | **biznes.gov.pl** — CEIDG / JDG registration, PKD, działalność nierejestrowana | https://www.biznes.gov.pl | canonical PL business portal; specific deep URLs 404'd this session — registration facts lower-confidence, confirm |
| **S11** | **podatki.gov.pl** — VAT registration & VAT-OSS (procedura unijna) | https://www.podatki.gov.pl | canonical PL tax portal; OSS/VAT registration procedure — confirm with księgowa |
| **S12** | **Stripe Data Processing Agreement** | https://stripe.com/legal/dpa (+ Privacy Center / sub-processor list) | retrieved 2026-07-12 — Art. 28 processor terms + SCCs |
| **S13** | **GDPR (Regulation 2016/679)** — Arts 28 (processor), 30 (RoPA), 44–49 (transfers) | EUR-Lex: https://eur-lex.europa.eu/eli/reg/2016/679/oj | primary legislation |
| **S14** | **Stripe Invoicing** docs | https://docs.stripe.com/invoicing | retrieved 2026-07-12 — PDF invoices, numbering, account/customer tax IDs, localization |
| **S15** | **HMRC** — VAT on digital services / non-established taxable persons (UK) | https://www.gov.uk/guidance/vat-rules-for-supplies-of-digital-services-to-consumers | UK B2C digital VAT; no threshold for non-established sellers — confirm current HMRC text |
| **S16** | **US economic nexus** — *South Dakota v. Wayfair* (2018); Streamlined Sales Tax; representative state DOR (e.g. CDTFA) | https://www.streamlinedsalestax.org ; state DOR pages | per-state thresholds (~$100k/200 txn pattern) & SaaS taxability vary — confirm per state |
| **S17** | **Merchant-of-Record** providers — Paddle, Lemon Squeezy (MoR/tax compliance pages) | https://www.paddle.com ; https://www.lemonsqueezy.com | MoR = seller of record, assumes worldwide tax/invoicing/consumer-law |
| **S18** | **UK Consumer Contracts Regulations 2013** | https://www.legislation.gov.uk/uksi/2013/3134 | UK withdrawal-right equivalent + digital-content consent carve-out |
| **S19** | **Stripe Tax — registrations** | https://docs.stripe.com/tax/registering | registration monitoring + register-on-your-behalf scope |
| **S20** | **biznes.gov.pl / ZUS** — formy działalności (JDG vs sp. z o.o.), składka zdrowotna | https://www.biznes.gov.pl ; https://www.zus.pl | business-form comparison / liability / contributions — descriptive; confirm figures |

---

_End of research deliverable. Findings are separated from open questions (§11);
every material claim carries a §12 citation; date-sensitive claims (VAT thresholds,
KSeF) are dated and flagged "subject to change — confirm with accountant." This
document unblocks **B-6 planning**; **going live waits on the §0 professional
confirmation.**_
