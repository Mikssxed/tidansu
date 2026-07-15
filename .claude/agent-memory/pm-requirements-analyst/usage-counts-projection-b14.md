---
name: usage-counts-projection-b14
description: LIGHT-path scoping pattern for pure read-path performance fixes with no behaviour change (B-14); confirmed 3-call-site scope for the shared UsageDto.From(GetAllByUserAsync) pattern
metadata:
  type: project
---

B-14 (compute account usage counts — spaces/items/fullest-space — via a cheap
aggregate instead of loading the full space→zone→item→photo graph) is a fifth
LIGHT-path shape, alongside [[webhook-hardening-b9]], [[race-condition-hardening-b12]],
[[dependency-bump-b11]], and [[security-scalability-audit-b8]]: a **pure
read-path performance fix with no user-visible behaviour change**. The three
numbers shown must be bit-for-bit identical before/after; only their cost of
computation changes. Gets a short requirements note (usage-correctness FR +
an edge-case FR covering zero-spaces/zero-items/ties/soft-deleted spaces + a
scope FR + a plan-cap non-regression FR) rather than the full multi-phase
template — no new capability, no new paywall `reason`, no schema/API-shape
change.

**Why:** consistent with B-8/B-9/B-10/B-11/B-12 all being scoped down from the
default heavy template; explicit orchestrator instruction (2026-07-15) that
this is a light-path read-path fix.

**How to apply:** when a backlog item is framed as "compute the same output
more cheaply, no behaviour change," default to this shape: (1) pin down the
exact edge cases that must keep working (zero-count states, ties, soft-delete
inclusion rules) since those are the parts most likely to silently break in a
naive aggregate rewrite, (2) explicitly call out every call site sharing the
wasteful pattern — don't let scope quietly shrink to the one named in the
backlog text, (3) add an explicit non-regression FR for any plan-cap/paywall
check that reads the same numbers, since correctness here is load-bearing for
plan fairness even though the fix itself is "just" a performance change.

**Confirmed for B-14 (2026-07-15):** the identical `GetAllByUserAsync` →
`UsageDto.From(spaces)` pattern appears in **three** call sites —
`GetAccountQueryHandler`, `ChangePlanCommandHandler`, `SetSyncCommandHandler`
— all reading only `spaces.Count` and `s.Items.Count`/`Max`. All three
confirmed in scope for one task (not split into three tickets).
`GetSpacesQueryHandler` legitimately needs the full graph (layout view) and
stays out of scope; slimming its photo payload is the separate B-16 task.
