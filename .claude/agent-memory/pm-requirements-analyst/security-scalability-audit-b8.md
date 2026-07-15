---
name: security-scalability-audit-b8
description: B-8 audit scoping conventions — severity rubric, inline-fix threshold, no-build-stage framing for audit-type backlog items
metadata:
  type: project
---

B-8 (security & scalability audit) is Tidansu's template for how "audit" backlog
items get scoped, distinct from feature-build items: the deliverable is a
prioritized findings report (`review.md`), with **no PM multi-FR document, no
tech-lead task list, no developer implementation stage**. The PM stage produces
a short scoping note instead (audit lenses + concrete surfaces, severity
rubric, report format, out-of-scope carve-offs, definition of done) — not a
functional-requirements breakdown.

Severity rubric settled for audit-type items: 🔴 Critical = exploitable now,
no special conditions (data exposure across accounts, auth bypass, plan-limit
bypass, payment/webhook forgery). 🟠 Major = exploitable under plausible but
specific conditions, or a clear scalability cliff at realistic data volumes.
🟡 Minor = hardening/defense-in-depth or UX rough edge, no direct exploit path.

**Inline-fix threshold (user-confirmed):** during an audit task, trivial
findings (~≤30 LOC, no design judgement call) may be fixed inline as part of
the audit task itself. Anything Critical/Major, or requiring a design
decision, must be written up and deferred to a new follow-up backlog item —
never fixed inline, even if small.

**Why:** confirmed while scoping B-8 (2026-07-14); mirrors the B-7 vs B-8 split
already recorded in [[production-readiness-sweep]] (B-7 = end-to-end
verification + trivial fixes only; B-8 = deep authz/IDOR/plan-bypass/N+1/index
findings). Known follow-ups already carved off and NOT to be re-filed by B-8:
B-9 (webhook rate-limit + body cap), B-10 (async Stripe payment methods), B-11
(NU1903 dependency bumps).

**How to apply:** when scoping any future "audit" or "review" backlog item
(as opposed to a feature), reuse this severity rubric and the same-size
inline-fix threshold unless the user says otherwise, and keep the PM output to
a scoping note rather than a full FR document.
