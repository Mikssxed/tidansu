---
name: billing-stripe
description: Tidansu billing/Stripe business rules — the money path behind the paywall, build-vs-go-live gate, and phasing decisions
metadata:
  type: project
---

Tidansu monetizes via a single **Free→Pro recurring subscription** through Stripe.
Billing is the money path *behind* the paywall: the paywall fires with a `reason`
∈ [[plan-limits]] and the upgrade CTA leads to Stripe Checkout; a signature-verified
webhook is the **only** thing that grants Pro. Downgrade (cancel/lapsed payment)
returns Pro→Free keeping data, over-cap content read-only.

**Why:** Recurring backlog work (B-6 real Stripe, B-7 prod sweep, B-8 audit) all
touch this surface, and the framing is easy to get wrong.
**How to apply:** When writing billing requirements —
- **Build vs. go-live are separate milestones.** B-6 is *done* at Stripe **test-mode**
  verified end-to-end; charging a **real** customer is gated on the B-5 §10
  go-live checklist (JDG/VAT-OSS/VAT status, Stripe Tax + Invoicing, KSeF plan,
  consumer-law checkout, legal pages, GDPR/DPA/RoPA) + §11 professional confirmation.
  Never conflate "built" with "authorized to charge."
- **Webhook trust is core:** signature verification + idempotency (Stripe retries,
  at-least-once) + secure Stripe-customer→Tidansu-user mapping. Never grant Pro from
  an unverified/forged event; never map via client-supplied email.
- **Secrets:** test keys in dev, live in prod, both from environment, never in source.
  Misconfigured → billing disabled with clear error; never silent free upgrade, never
  crash. (A dormant direct/no-payment fallback billing mode exists — must never be
  reachable by accident in prod.)
- **Baseline is Stripe-direct**, not a Merchant-of-Record (Paddle/Lemon Squeezy).
  MoR is an informative alternative only (B-5 §9.2, OQ-3), not a switch.
- **Legal-checkout items** (Stripe Tax, withdrawal-consent waiver + disclosures +
  "Subscribe & pay" button, Stripe Invoicing) are seam-support hooks — build behind
  config, but which land inside a given task vs. a follow-up is an **owner gate**.
  **KSeF** e-invoicing is always a separate dependency; Stripe PDFs don't satisfy it.

The legal research lives in `docs/legal/poland-payments-compliance.md` (§10 = go-live
checklist, §11 = open questions for accountant/lawyer). Consistent with [[eu-poland-launch]].
