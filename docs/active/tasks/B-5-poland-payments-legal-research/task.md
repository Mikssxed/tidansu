---
id: B-5
slug: poland-payments-legal-research
title: Legal & compliance to charge customers in Poland (research)
status: done        # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: []         # gates B-6 (real Stripe); nothing gates B-5
touch-points:          # this is a research write-up, not code
  - docs/ (research deliverable — a legal/compliance findings doc for the owner)
---

# B-5 · Legal & compliance to charge customers in Poland (research)

## Description
Before connecting real payments (B-6) we need to know whether — and under what
conditions — the owner (based in Poland) can legally sell a paid SaaS subscription
to customers. This is a **research write-up, not a code feature**: investigate
business-registration options, VAT / EU OSS obligations, consumer protection
(right of withdrawal for digital goods, T&C and required pre-purchase
disclosures), invoicing requirements, and GDPR obligations for a paid app. Record
findings and open questions to a doc the owner can confirm with a real
accountant/lawyer. It gates B-6 — its outcome may change whether and how we flip
Stripe to live.

## Acceptance criteria
- [ ] A research document exists (in `docs/`) covering: business registration
      options, VAT/EU OSS, consumer protection (withdrawal for digital goods,
      T&C, pre-purchase disclosures), invoicing, and GDPR for a paid app.
- [ ] Findings are clearly separated from **open questions** that need a real
      accountant/lawyer to confirm; nothing is presented as settled legal advice.
- [ ] Sources are cited (primary/authoritative where possible) so the owner can
      verify each claim.
- [ ] The doc calls out anything that would change **how B-6 flips Stripe to
      live** (e.g. required legal pages, VAT handling in Checkout, invoice needs).

## Notes
- **2026-07-12 — research complete → in-review.** Deliverable written to
  [`docs/legal/poland-payments-compliance.md`](../../../legal/poland-payments-compliance.md)
  (13-section doc, FR-1..FR-23 all covered, §12 sources index). Verdict: Stripe (Tax +
  Invoicing) handles VAT/tax **calculation, collection, and invoice generation** worldwide,
  but **registration + filing/remittance (OSS, UK, US) and KSeF stay the owner's job** — the
  "Stripe does everything" assumption holds for calc/collect, fails for register/file. Top
  go-live blockers for B-6: VAT-OSS registration, KSeF path, withdrawal-consent checkout step,
  legal pages (ToS/privacy/withdrawal/imprint), Stripe DPA. All Phase-1/2/3 tasks done except
  the long-tail deepening (deferred per owner OQ-4). Doc unblocks B-6 **planning**; going live
  waits on the §0 accountant/lawyer confirmation.
- **Deliverable is a document, not shipped code.** The pipeline bends: Stage 3 is
  "write the research doc," not a code change; verification is doc completeness +
  citations, not build/type-check.
- Gates **B-6** (real Stripe). Do not start B-6 until this lands and the owner
  has reviewed it.
- Owner is based in **Poland**. **Owner decisions (2026-07-12):**
  - **Target market: worldwide** — available to everyone on the internet (EU +
    non-EU). Research must cover EU OSS *and* non-EU (US sales tax, UK VAT, etc.)
    at least at a "what obligations arise / how MoR-or-Stripe-Tax handles it" level.
  - **Business form baseline: sole trader (JDG)** — jednoosobowa działalność
    gospodarcza. Go deep on JDG; note when scale/risk would push toward sp. z o.o.
  - **Invoicing: Stripe does everything** — assume Stripe (Stripe Tax + Stripe
    invoices) is the billing & invoicing system of record. Research must validate
    whether that is actually sufficient/compliant for a PL JDG selling worldwide
    (KSeF/Polish invoice requirements, VAT registration thresholds, whether Stripe
    Tax covers PL/EU/non-EU), and flag any gap that needs a separate tool or a
    Merchant-of-Record instead.
- ⚠️ This is research to inform a professional consultation — it is **not** legal
  or tax advice and must say so.
- **Tech plan (2026-07-12) → [`./tech-tasks.md`](./tech-tasks.md).** Bent for a
  research deliverable: no build/migration/Kiota. Output doc =
  `docs/legal/poland-payments-compliance.md` (13-section skeleton). Tasks are
  ordered research+write units, each mapped to FR ids + primary sources; the
  executing agent runs the repo's **`research` skill** per topic-section.
  Verification = coverage + citation discipline, not a green build. Dependency spine:
  scaffold → Phase-1 body (§3 registration → §4 VAT → §5 Stripe-Tax gap → §7 invoicing;
  §6 consumer + §8 GDPR run in parallel) → §9 verdict + §10 B-6 handoff + §11/§12 →
  Phase-2/3 (sp. z o.o. triggers, MoR comparison, long-tail depth). The 5 owner open
  questions are carried into Open Questions (working assumptions chosen); only the
  long-tail deepening truly blocks on an owner answer (OQ-4).
- Requirements written (2026-07-12) → [`./requirements.md`](./requirements.md).
  23 FRs define the *research document* (questions to answer, structure, citation
  bar, findings-vs-open-questions split, Stripe-sufficiency verdict, B-6 handoff).
  Crux per the analysis: separate what Stripe Tax **calculates/collects** from what
  the owner must still **register & file** — that gap drives the go-live checklist.

- **Done (2026-07-12).** Deliverable: [`docs/legal/poland-payments-compliance.md`](../../../legal/poland-payments-compliance.md)
  — 13 sections, 23/23 FRs, 20 cited sources. **Verdict:** Stripe handles tax
  *calculation / collection / invoice generation* worldwide, but **registration,
  filing/remittance, and KSeF stay the owner's job** — that gap drives the B-6
  go-live checklist (§10). Owner chose **Accept as-is** at the Stage-4 gate (no
  code review — it's a Markdown doc). **Known caveat:** Poland-specific numbers
  (nierejestrowana cap, PLN 200k+OSS interaction, art. 106e/PLN invoice rules,
  KSeF date, PKD codes) are **lower-confidence** — the PL gov SPA portals couldn't
  be fetched live — and sit in §11 open questions for the accountant/lawyer to
  confirm before B-6 goes live.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → **skipped by owner choice** (research doc, no code to audit); the
  research doc's own §11 is the open-questions register in lieu of `review.md`.
