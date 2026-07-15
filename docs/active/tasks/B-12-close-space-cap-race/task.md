---
id: B-12
slug: close-space-cap-race
title: Close the Free space-cap concurrency race (S-1)
status: done   # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: []
touch-points:
  - src/Tidansu.Application/Spaces/Commands/CreateSpace/CreateSpaceCommandHandler.cs
  - src/Tidansu.Infrastructure (repository / DB constraint)
---

# B-12 · Close the Free space-cap concurrency race (S-1)

## Description
From the B-8 audit (🟠 S-1). The Free 2-space cap is enforced with a
read-then-insert in `CreateSpaceCommandHandler` — the current space count is read,
then the new space is inserted in a separate non-locking round-trip, with no
DB-level constraint. A user at 1 space firing several concurrent
`POST /api/spaces` requests can have every request read count < 2 and all insert,
exceeding the Free cap without paying. This closes that gap so parallel POSTs
cannot both pass the gate. A genuine plan-limit bypass, though it requires
deliberate concurrency to trigger.

## Acceptance criteria
- [x] A Free user at the 2-space cap firing N concurrent `POST /api/spaces` ends
      up with at most 2 spaces (extra requests are rejected with the plan-cap
      response, not silently dropped or 500'd).
- [x] The count-check + insert are enforced atomically (serializable transaction
      or a DB-level per-user space-count constraint).
- [x] The normal single-request create path and the existing paywall `reason:
      spaces` response are unchanged for non-concurrent use.
- [x] No regression to Pro (unlimited) creation.

## Notes
Scoped as a LIGHT-path hardening item (see `requirements.md`) — short FR note,
not a full multi-phase document, since the desired end-state is already fully
described by the acceptance criteria.

Open question for tech-lead: serializable transaction vs. DB-level constraint —
weigh correctness, retry/UX on conflict, and how the rejection maps to the
existing plan-cap HTTP response (both satisfy the same business guarantee;
this is a technical trade-off, not a product decision).

Gate 1 decisions (product owner, 2026-07-14):
1. Race-lost rejection is treated **identically** to a normal at-cap rejection
   (same `reason: spaces` 403, no distinct messaging).
2. **Observability required** — added as FR-4: emit a server-side signal
   (structured log at minimum) when a request is rejected *because it lost the
   race*, distinct from an ordinary at-cap rejection. Backend-only, no new user
   surface.

Sibling audit follow-ups: B-13..B-19.

Tech-lead decision (2026-07-14): mechanism = per-user `sp_getapplock`
(exclusive, transaction-scoped) wrapping an authoritative in-lock re-count +
insert, behind a new `ISpacesRepository.AddWithinSpaceCapAsync(space, spaceCap)`.
Handler keeps `PlanPolicy`/`PlanCaps` (business); repo owns the lock/transaction
(infra). DB-level constraint rejected (plan-variable cap: Free 2 / Pro ∞);
SERIALIZABLE+retry rejected (heavier, deadlock-prone). **No EF migration** (no
schema change) and **no Kiota regen** (403 `{plan:["spaces"]}` contract
unchanged) — both confirmed in tech-tasks. FR-4 race-lost = distinct
`LogWarning` on the in-lock-reject branch only; ordinary at-cap stays on the
pre-check branch (no race log). Pro path bypasses the lock entirely. Open Qs:
SQL-Server coupling of `sp_getapplock` (accepted — no cross-provider tests) and
the 5000 ms lock timeout bound.

Review round (2026-07-15): two reviewers ran on partitioned axes (branch =
correctness/convention; security = trust/injection/fail-open) and **independently
converged on one Major**: `sp_getapplock` reports its outcome via a stored-proc
**return code**, not by throwing, and the code discarded it — so a non-granted
lock (e.g. `@LockTimeout` expiry) fell through to the count+insert **without the
lock held**, reopening the very race this task closes. Fixed (M1/S-J1): return
code captured via `DECLARE @res int; EXEC @res = sp_getapplock ...; SELECT @res`
through `SqlQuery<int>` (still parameterized), `< 0` → LogError + rollback +
throw. Surfaced as a **500, not** `reason: spaces` — a lock timeout is transient
infrastructure, not an at-cap decision. Also fixed: S-N1 (resource key is now a
fixed-width SHA-256 hex digest, so it can't approach the 255-char `@Resource`
bound or collide) and S-L1 (lock-failure logged with its return code). **N1 not
applied** — de-duplicating `PlanCaps.For` would tangle control flow across the
Domain boundary for zero gain (pure `switch`); accepted as negligible.

Final verification (2026-07-15, all first-hand against the running API):
- **Fail-closed (M1)** — held the user's exact lock from a separate `sqlcmd`
  connection, fired a create for a user at **0 spaces**: blocked 5.11 s (real
  `@LockTimeout=5000`) → **500**, **count stayed 0** (pre-fix: 200 + insert);
  logged `sp_getapplock returned -1`; recovered to 200 after release.
- **FR-1** — 25 truly-concurrent creates (multiprocess barrier, pre-connected
  sockets) at 1 space → exactly **1×200 / 24×403 `{plan:["spaces"]}` / 0×500**,
  final count **2**. 3 `Space cap race lost` warnings → FR-4 branch confirmed live.
- **FR-3 Pro** — 10 concurrent creates → **10/10 × 200**, zero lock/race log
  lines (lock genuinely bypassed).
- `dotnet build` → **0 warnings / 0 errors**.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
