---
name: eu-poland-launch
description: Tidansu is launching from Poland; EU data residency / GDPR is a recurring product-owner preference for third-party providers
metadata:
  type: project
---

Tidansu's owner is based in **Poland** and launching into the EU. Recurring
product-owner preference: when a feature introduces a **third-party provider that
processes personal data** (email addresses, payments, etc.), prefer **EU-hosted /
GDPR-friendly** options and flag data-residency as a decision input.

**Why:** Surfaced in B-4 (transactional email provider choice) and is the whole
subject of B-5 (Poland legal/compliance research that gates B-6 real Stripe).
**How to apply:** For any external-provider requirement, add an Open Question
listing EU-residency/GDPR as a selection criterion; don't pick the provider
yourself when the owner has deferred the choice — lay out options + trade-offs.

**Settled B-5 owner decisions (2026-07-12), reusable for B-6+ billing work:**
- **Target market: worldwide** (EU + non-EU) — VAT/tax reasoning must cover EU OSS
  *and* non-EU (US sales-tax nexus, UK VAT), not just Poland.
- **Business form baseline: sole trader / JDG** (jednoosobowa działalność
  gospodarcza); sp. z o.o. only revisited at scale/risk.
- **Invoicing/billing system of record: Stripe** (Stripe Tax + Stripe invoices) —
  but this is an *assumption to validate*, not a proven fact. Recurring crux for
  billing tasks: separate what Stripe Tax **calculates/collects** from what the
  owner must still **register & file** (VAT/OSS returns, US state filing, PL
  KSeF-compliant invoices); that gap is where cost/risk hides and may justify a
  Merchant-of-Record (Paddle/Lemon Squeezy) alternative.
