---
id: B-8
slug: security-scalability-audit
title: Security & scalability audit (UI + backend)
status: done           # draft → requirements → tech-planning → in-progress → in-review → done | blocked  (audit skips tech-planning/in-progress)
depends-on: []         # B-4/B-6/B-7 are code-complete; audit runs on current main
touch-points:          # whole codebase — audit reads, does not (in this task) modify
  - src/Tidansu.Infrastructure   # EF queries, indexes, TidansuDbContext, services
  - src/Tidansu.Application      # command/query handlers, validators, ownership checks
  - src/Tidansu.API              # controllers, auth/billing surfaces, middleware, Program.cs
  - src/Tidansu.App              # UI/UX correctness sweep
---

# B-8 · Security & scalability audit (UI + backend)

## Description
A final pre-launch audit across the whole app. Backend **security** — IDOR/ownership
on spaces/zones/items, plan-limit bypass, auth/token handling, billing/webhook
integrity, input validation, redirect safety. **Scalability** — N+1 queries, missing
indexes, unbounded payloads, per-request work that won't hold under load. Plus a
**UI/UX correctness** sweep. This is an *audit*: the deliverable is a prioritized
findings report; fixes for critical/major issues become follow-up backlog tasks.

## Acceptance criteria
- [ ] A single prioritized findings report exists (`review.md`) covering all three
      lenses: backend security, scalability, UI/UX correctness.
- [ ] Each finding has: severity (🔴 Critical / 🟠 Major / 🟡 Minor), location
      (`file:line`), concrete failure scenario, and a recommended fix.
- [ ] Security surfaces explicitly covered: IDOR/ownership, plan-limit bypass,
      auth/token handling, billing/webhook integrity, input validation, redirect safety.
- [ ] Scalability surfaces explicitly covered: N+1, indexes, unbounded payloads,
      per-request work under load.
- [ ] Critical/Major findings enumerated as candidate follow-up backlog items.
- [ ] No code changes shipped under this task (audit only) unless the user opts to
      fix a trivial finding inline.

## Notes
- **Not a feature build.** No PM multi-FR doc, no tech-lead task list, no developer
  implementation stage. The "work" is the review itself.
- `main` is clean and everything (B-4/B-6/B-7) is merged → auditors must run in
  **whole-codebase** mode, not branch-diff mode (a diff vs origin/main is empty).
- Known follow-ups already carved off from the B-6 security review: [[B-9]] webhook
  rate-limit + body cap, [[B-10]] async Stripe payment methods, [[B-11]] NU1903
  dependency bumps. The audit should not re-file these — reference them and focus
  on net-new findings.
- Run with `security-reviewer` (whole-codebase) for the security half; a second pass
  for scalability + UI/UX correctness.

## Outcome (2026-07-14)
Audited whole-codebase on `main` in two partitioned passes (security-reviewer + branch
reviewer). **0 Critical · 8 Major · 9 Minor.** Core data path verified clean. 8 Majors filed
as backlog **B-12–B-19**; 5 Minors fixed inline this task and verified with `dotnet build`
(0 errors) + `npm run build` (clean):
- **S-5** JWT-secret fail-loud guard scoped `IsProduction()` → `!IsDevelopment()`
- **S-7** reset `user.SyncOn = false` on Stripe downgrade
- **S-8** reject `PrefixLength == 0` (all-addresses) ForwardedHeaders ranges
- **U-4** guard `CreateSpaceView.finish()` with `checkAddSpace`
- **U-5** revert optimistic sync toggle + surface message on failure
Remaining Minors (S-3, S-4, S-6, SC-4, SC-5) left as low-priority hardening in `review.md`.
Not committed — changes left in the working tree for the user.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst (scoping note)
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — N/A (audit, no build stage)
- Review → [`./review.md`](./review.md) — security-reviewer + scalability/UX pass (THE deliverable)
