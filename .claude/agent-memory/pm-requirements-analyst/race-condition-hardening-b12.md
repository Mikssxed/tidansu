---
name: race-condition-hardening-b12
description: LIGHT-path scoping pattern for concurrency/atomicity correctness fixes on an existing plan-gating surface (B-12); recommended default for race-lost-request UX
metadata:
  type: project
---

B-12 (close the Free 2-space cap concurrency race — B-8 audit S-1) is a fourth
LIGHT-path shape, alongside the endpoint-guard/event-handler pattern in
[[webhook-hardening-b9]], the audit-type pattern in
[[security-scalability-audit-b8]], and the dependency-bump pattern in
[[dependency-bump-b11]]: a **concurrency/atomicity correctness fix on an
existing plan-gating surface** (read-then-insert race letting concurrent
requests all pass a cap check). No new capability, no new paywall `reason`,
no UI change — the entire deliverable is "make the existing guarantee hold
under concurrency, with identical behaviour for the normal single-request
path." Gets a short requirements note (3 FRs: the atomicity guarantee, clean
rejection for the losing request(s), explicit non-regression of the
single-request/Pro-unlimited path) rather than the full multi-phase template.

**Why:** consistent with how B-8/B-9/B-10/B-11 were all scoped down from the
default heavy template (2026-07-14); the task.md brief for this class of item
already fully specifies the desired end-state via its acceptance criteria, so
the PM value-add is tightening business framing + surfacing the UX question
the tech-lead can't answer, not generating new scope.

**How to apply:** when a backlog item is framed as "close a race/atomicity gap
in an existing check-then-act flow" (as opposed to adding a new guard/branch
to an existing endpoint, or a pure dependency bump), default to the 3-FR
short-note shape above, explicitly mark the locking/constraint mechanism
choice as a tech-lead decision (not a product one — both approaches satisfy
the same business guarantee, differing only in retry/latency trade-offs), and
raise as an open question whether a request that *loses* the race should be
presented identically to a normal cap-hit rejection or given distinct
messaging/retry behaviour. Recommended default answer: treat identically —
reuse the existing paywall `reason` response, no new UI state, since this is a
narrow/adversarial-concurrency edge case with no clear user benefit from a
distinct "someone else just took the last slot" experience.
