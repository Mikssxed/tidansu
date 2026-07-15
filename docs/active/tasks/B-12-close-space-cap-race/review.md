# Code Review: B-12 · Close the Free space-cap concurrency race (S-1)
**Date**: 2026-07-14
**Reviewer**: branch-code-reviewer agent
**Diff base**: origin/main (working tree — uncommitted, multi-task; B-12 isolated to 3 files)
**Files changed (B-12)**: 3
**Axis**: correctness / convention / scope-creep. Trust/injection/fail-open is owned by a
parallel security-reviewer; a lock-timeout note below flags the correctness side only, with
a one-line cross-reference to that axis.

## Summary
The change implements exactly the approved mechanism: a cheap unchanged pre-check in the
handler, then for finite-cap (Free) plans a per-user transaction-scoped exclusive
`sp_getapplock` wrapping an authoritative in-lock re-count + insert, behind the new
`ISpacesRepository.AddWithinSpaceCapAsync`. Pro bypasses the lock, `PlanLimitException` is
reused, no migration/Kiota/DI churn — scope is tight and the layering (business in
Application, atomicity in Infrastructure) is respected. One real correctness gap: the
`sp_getapplock` return code is never captured, so a lock **timeout** silently fails open
rather than surfacing — contradicting the plan's own Open-Question-2 assumption. The window
is narrow (needs the per-user lock held >5 s), so it does not block merge, but it is a
latent hole in the very mechanism this task adds.

## 🔴 Critical (must fix before merge)
None.

## 🟠 Major (strongly recommended)

### [M1] `sp_getapplock` return code is ignored — lock timeout fails *open*, not to a 500
**File**: `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs:48-50`
**Category**: Correctness
**Description**: `sp_getapplock` communicates outcome through its **stored-proc return
code**, not by raising an error: `0`/`1` = granted, `-1` = timeout, `-2` = cancelled,
`-3` = deadlock victim, `-999` = other. It does **not** throw on timeout. The call here runs
it via `ExecuteSqlInterpolatedAsync` and discards the return value, so on a `@LockTimeout`
(5000 ms) expiry the code silently proceeds to the re-count + insert **without holding the
lock** — i.e. the serialization guarantee this task exists to provide is dropped exactly
under the sustained same-user contention where it matters. This directly contradicts the
plan's Open Question #2 ("the transaction fails and the request surfaces as a 500"): a
timeout is code `-1`, not an exception, so there is no 500 — the request fails *open*.
In practice the lock is held only for one insert (milliseconds), so a 5 s wait requires an
unrealistic backlog of same-user creates or a very slow DB; that keeps this out of Critical.
But it is a genuine latent bypass in the safety mechanism, and it silently degrades if the
timeout is ever lowered or the DB slows. (The security-reviewer owns the fail-open framing;
this entry is the control-flow correctness view — capturing the code fixes both.)
**Recommendation**: Capture the return code and fail *closed*. Roll back and either return
`false` (treat as at-cap) or throw so it surfaces as a 500 rather than an unlocked insert:
```csharp
var lockResult = await dbContext.Database
    .SqlQuery<int>($@"
        DECLARE @res int;
        EXEC @res = sp_getapplock @Resource={resource}, @LockMode='Exclusive',
             @LockOwner='Transaction', @LockTimeout={5000};
        SELECT @res AS Value;")
    .SingleAsync(cancellationToken);
if (lockResult < 0)
{
    await transaction.RollbackAsync(cancellationToken);
    throw new InvalidOperationException(
        $"Could not acquire space-create lock for user {space.UserId} (sp_getapplock={lockResult}).");
}
```
(Exact retrieval shape is flexible — the load-bearing point is: inspect the code, and on
`< 0` do not fall through to the insert.) Update the tech-tasks Open Question #2 note to
match the corrected behaviour.

## 🟡 Minor (nice-to-have)

### [N1] `PlanCaps.For(user.Plan)` is evaluated twice on the create path
**File**: `src/Tidansu.Application/Spaces/Commands/CreateSpace/CreateSpaceCommandHandler.cs:31,37`
**Category**: Convention (tech-tasks refactor note asked the plan be evaluated once)
**Description**: The pre-check `PlanPolicy.CheckNewSpace(user.Plan, …)` resolves the caps
internally (`PlanPolicy.cs:20`), and the handler then calls `PlanCaps.For(user.Plan).Spaces`
again at line 37. The refactor task asked that "`PlanCaps.For(user.Plan)` … is made once."
`PlanCaps.For` is a pure record construction over a `switch`, so the cost is negligible and
the duplication is a consequence of `CheckNewSpace` encapsulating its own lookup — not worth
restructuring the policy seam over. Flagging only for completeness against the plan's note.
**Recommendation**: Leave as-is, or (if the note is to be honoured literally) have the
handler resolve `caps = PlanCaps.For(user.Plan)` once and pass the pieces down. Not required.

## 🧭 Convention Violations (project rules)
- None. XML doc on the new interface method documents the *contract* (not the SQL) as the
  seam, per plan; the impl carries a clear why-comment including the `EnableRetryOnFailure`
  coupling caveat; naming (`AddWithinSpaceCapAsync`) mirrors the existing `AddAsync`; guard-
  clause style is used; no dead code.

## 🏗️ Architecture Notes
- Layer discipline holds: `PlanPolicy`/`PlanCaps` (the business rule) stay in Application;
  the repository takes an `int spaceCap` and returns a `bool`, never learning about plans —
  the thin seam the tech-lead specified. EF/transaction concerns stay in Infrastructure.
- Transaction lifecycle is correct on every path: `await using var transaction` guarantees
  rollback-on-dispose, so success (explicit commit), at-cap (explicit rollback + `false`),
  mid-flight exception, and cancellation all release the transaction and connection with no
  leak. The explicit `RollbackAsync` on the at-cap branch is redundant with the `await using`
  but is harmless and reads as clear intent — fine to keep.
- Scope is clean: only the three approved files changed. DI (`ServiceCollectionExtensions`)
  untouched (method added to an already-registered type), no EF migration (no schema change —
  correct), no Kiota regen (403 `{plan:["spaces"]}` contract unchanged — correct), controller
  and command untouched. The rest of the dirty worktree (B-8..B-11 billing/webhook/deps) is
  unrelated and out of scope for this review.
- SQL-Server coupling of `sp_getapplock` is accepted per the plan's Open Question #1 (no
  cross-provider tests); the guard would only be needed if this handler is ever exercised
  against SQLite/in-memory — worth remembering, not actionable now.

## 👍 Positives
- Mechanism matches the approved plan precisely; FR-1/2/3/4 all realized as specified, and
  the developer drove it under real 25-way concurrency (1 success / 24×403, count held at 2).
- FR-4 race-lost `LogWarning` is on the in-lock-reject branch only; the ordinary at-cap
  rejection stays on the pre-check branch — the two are cleanly distinguishable in logs.
- Pro path (`caps.Spaces == null`) genuinely bypasses the lock and transaction — no
  artificial serialization or new failure mode for unlimited users.
- Injection-safe lock resource: `ExecuteSqlInterpolatedAsync` parameterizes `@Resource`
  (built from `userId`) and `@LockTimeout` (security-reviewer's axis — cross-referenced only).
- The `EnableRetryOnFailure` execution-strategy caveat is captured as a code comment so a
  future retry-enable change is caught.

## Action Checklist
- [x] [M1] Capture `sp_getapplock`'s return code; on `< 0` roll back and fail closed instead
      of falling through to the insert (and correct the tech-tasks Open-Q-2 "500 on timeout"
      claim to match).
- [ ] [N1] (Optional) Resolve `PlanCaps.For(user.Plan)` once in the handler, or accept the
      duplicate as negligible. → **Accepted as-is, not applied** (see Resolution).

---

## Resolution (2026-07-15)

**[M1] FIXED and proven.** `SpacesRepository.AddWithinSpaceCapAsync` now captures the
return code via `DECLARE @res int; EXEC @res = sp_getapplock ...; SELECT @res` through
`SqlQuery<int>` (still fully parameterized — `@Resource`/`@LockTimeout` are bound params,
so the injection-safety property is preserved). On `< 0` it logs, rolls back, and throws —
**failing closed**. The tech-lead's Open-Q-2 assumption is now actually true rather than
assumed.

Design note: a non-granted lock is surfaced as a **500, not** a `PlanLimitException`.
A lock timeout is a transient infrastructure condition, not an at-cap decision — reporting
it as `reason: spaces` would wrongly tell an under-cap user they were capped.

**Proof (drove the real API, `failclosed_proof.py`):** held the user's exact lock resource
from a separate `sqlcmd` connection, then fired a create for a user at **0 spaces** (so the
lock was the *only* thing that could stop an insert):
- create blocked **5.11 s** (the real `@LockTimeout=5000`), then returned **HTTP 500**
- **space count stayed 0** — no over-cap insert. Pre-fix this path returned 200 and inserted.
- log: `Space-create lock not acquired for user 97155d9a-…: sp_getapplock returned -1`
- after lock release, a normal create returned **200** (count 1) — no lasting damage.

**[N1] Not applied — accepted as negligible.** De-duplicating would require either changing
`PlanPolicy.CheckNewSpace`'s signature or passing caps across the Domain boundary, which
tangles the control flow for zero gain: `PlanCaps.For` is a pure `switch` expression.
Confirmed still evaluated twice (`PlanPolicy.cs:19` + `CreateSpaceCommandHandler.cs:37`).

**Regression re-checks post-fix (all first-hand):** FR-1 25-way concurrent → exactly 1×200 /
24×403 `{plan:["spaces"]}` / 0×500, final count **2**; 3 `Space cap race lost` warnings fired,
confirming FR-4's in-lock branch still works. Pro 10-way concurrent → **10/10 × 200**, zero
lock/race log lines (lock genuinely bypassed). `dotnet build` 0 warnings / 0 errors.
