# Tidansu — Security Review
**Date:** 2026-07-14
**Scope:** B-12 branch changes (uncommitted on `main`) — `ISpacesRepository.cs`, `SpacesRepository.cs` (`AddWithinSpaceCapAsync`), `CreateSpaceCommandHandler.cs`. Axis: trust / injection / fail-open vs fail-closed on the space-cap lock. (Correctness/convention axis owned by the parallel branch-code-reviewer.)
**Type:** Findings report only — no code changes made.

**Overall:** The chosen mechanism is sound and the trust boundaries are correct: the lock resource is derived from the server-authenticated user id (never client input), the `sp_getapplock` call is fully parameterized (no injection), the in-lock re-count is authoritative, and the Pro bypass cannot be reached by a Free user. There is **one real gap on my axis**: the `sp_getapplock` *return status is never inspected*, so a lock that is **not granted** (timeout `-1`, deadlock `-3`, other `-999`) is silently ignored and the insert proceeds **without the lock held** — i.e. the mechanism **fails open**, contrary to the tech-tasks' stated fail-closed intent. Under the task's own exploit scenario (a small fan-out) the lock does not time out and the cap holds, so this is a latent integrity gap rather than a readily-exploitable bypass — rated Major, not Critical.

## What's already done right
- **No SQL injection.** `AddWithinSpaceCapAsync` uses `ExecuteSqlInterpolatedAsync`, so `@Resource` and `@LockTimeout` are bound as SQL parameters, not concatenated. `@LockMode='Exclusive'` / `@LockOwner='Transaction'` are static literals. `ExecuteSqlRaw` with an interpolated id is correctly avoided. (`SpacesRepository.cs:48-50`)
- **Lock resource is trusted, not attacker-controlled.** `resource = $"tidansu:space-create:{space.UserId}"` where `space.UserId` is set by `dto.ToEntity(userId)` from `userContext.GetCurrentUser().Id` — the DTO's own id fields are overwritten server-side, so a client cannot steer the lock key onto another user or inject metacharacters. (`SpacesRepository.cs:47`, `SpaceDto.cs:33`, `CreateSpaceCommandHandler.cs:20,36`)
- **Cross-user isolation is correct.** The lock is keyed per-user, so distinct users take distinct resources — no global lock serializing everyone, and no collision letting one user's lock affect another. Because `UserId` is server-set, a user cannot grief another by forging the key.
- **Plan-boundary integrity holds.** The in-lock `CountAsync(s => s.UserId == space.UserId)` re-reads the true count inside the transaction (authoritative, not the stale handler count). The cap comes from `PlanCaps.For(user.Plan).Spaces` with `user` loaded server-side — the client cannot tamper with the cap or the plan. (`SpacesRepository.cs:52`, `CreateSpaceCommandHandler.cs:37`)
- **Pro bypass cannot be abused by Free.** The lock-skipping branch is gated on `spaceCap is int cap` (finite = Free); Pro (`null`) alone skips the lock. A Free user's plan is server-authoritative, so they cannot reach the unlocked `AddAsync` path. (`CreateSpaceCommandHandler.cs:38-54`)
- **Exception paths fail closed.** A throw from the `sp_getapplock` exec, the re-count, or `SaveChangesAsync` propagates out; the `await using` transaction disposes and rolls back → no insert → 500 via `ErrorHandlingMiddleware`. No over-cap row is committed on error.
- **Per-request connection makes the lock real.** `TidansuDbContext` and `SpacesRepository` are both scoped, so two concurrent same-user requests run on separate connections/transactions and genuinely contend for the app-lock (a singleton context would have defeated it). Transaction-owned lock releases deterministically on commit/rollback.

## Security findings

### Critical
None.

### High
None.

### Major
**S-J1 — `sp_getapplock` return status is discarded → fail-open on lock-acquire failure**
`SpacesRepository.cs:48-50`. `sp_getapplock` signals success/failure through its **stored-procedure return value**, not by raising an error: `0`/`1` = granted, `-1` = timeout, `-2` = cancelled, `-3` = deadlock victim, `-999` = parameter/other error. `ExecuteSqlInterpolatedAsync` returns rows-affected and **does not inspect the proc's return code**, and the code here captures nothing. Consequently, when the lock is **not granted** — e.g. the `@LockTimeout=5000` expires under sustained same-user contention, or a deadlock/`-999` occurs — execution falls straight through to the re-count and insert **without holding the exclusive lock**. Two such transactions then run the count under READ COMMITTED (no range lock), both observe `count < cap`, and both insert → the exact read-then-insert race this task closes **re-opens**. This also contradicts tech-tasks Open Question #2, which assumed "on timeout the transaction fails and surfaces as a 500" (fail-closed) — the real behavior is fail-open, silent.
Reachability: the critical section is a millisecond-scale COUNT+INSERT, so the 5 s timeout only trips under very high sustained same-user concurrency (or a degraded DB); the task's own 5-request fan-out drains well inside the window and the cap holds. Hence Major (latent integrity gap), not Critical.
**Fix:** capture and enforce the return code so acquisition failure fails **closed**. E.g. bind an output/return parameter and treat any value `< 0` as failure → roll back and throw (or return `false` only for the true at-cap case, and throw for a non-granted lock so it becomes a 5xx rather than a silent over-cap insert). Concretely, use a return-value capture such as `EXEC @result = sp_getapplock ...` with `@result` as an output `SqlParameter`, then `if (result < 0) { rollback; throw; }` before the re-count. Do not let a non-granted lock reach the insert.

### Minor
**S-N1 — Lock resource relies on `UserId` staying under the 255-char `@Resource` bound (defense-in-depth)**
`SpacesRepository.cs:47`. `sp_getapplock @Resource` is `nvarchar(255)`; the key is `"tidansu:space-create:" + UserId` (~21 char prefix). ASP.NET Identity ids are GUID strings (~36 chars), so there is no practical collision today. But the `AspNetUsers.Id` column allows up to 450 chars, so a future custom id scheme (>234 chars) would silently truncate and could collide two users onto one lock, or push distinct users toward the same truncated key. Not currently exploitable. **Fix (hardening):** derive the resource from a fixed-width hash of `UserId` (e.g. SHA-256 hex) so length is bounded and collision-free regardless of id format.

### Low / Hardening
**S-L1 — Timeout edge surfaces as an opaque 500 rather than the plan-cap 403.** Independent of S-J1's correctness bug: once S-J1 is fixed to fail closed, a genuine lock timeout will (correctly) become a 5xx. That is acceptable per the task's Open Question #2, but consider mapping a "lock not acquired" outcome to a retryable 409/503 with a distinct log so it is observably separable from an ordinary at-cap 403 and from a real server fault. Observability-only; no data-path impact.

## Resolution (2026-07-15) — S-J1 FIXED & proven, S-N1 FIXED, S-L1 FIXED

**🟠 S-J1 (fail-open on non-granted lock) — FIXED.** The `sp_getapplock` return code is now
captured (`DECLARE @res int; EXEC @res = sp_getapplock ...; SELECT @res` via `SqlQuery<int>`)
and `< 0` rolls back + throws. **Fail-closed confirmed by driving the real API**, not by
inspection: with the user's exact lock resource held from a separate `sqlcmd` connection, a
create for a user at **0 spaces** blocked 5.11 s (real `@LockTimeout=5000`), returned **500**,
and **inserted nothing** (count stayed 0). Pre-fix that path returned 200 and inserted without
the lock. Post-release create returned 200 — recovers cleanly.

- **Injection safety preserved**: `@Resource`/`@LockTimeout` remain bound parameters via the
  interpolated `SqlQuery<int>` — no string concatenation was introduced by the fix.
- **Correctly NOT a plan-limit rejection**: the fail-closed surface is a genuine 500, not
  `reason: spaces` — a lock timeout is transient infrastructure, not an at-cap decision, so an
  under-cap user is never falsely told they're capped.

**🟡 S-N1 (255-char `@Resource` bound) — FIXED.** The resource key is now
`tidansu:space-create:` + **SHA-256 hex** of the user id (`HashUserIdForLock`), a fixed 64-char
digest. Total key length is constant regardless of id scheme, so it can never approach the
255-char bound nor truncate two users onto one lock — closing the defense-in-depth gap against
a future >234-char id scheme.

**🟡 S-L1 (timeout observability) — FIXED.** A non-granted lock now emits
`LogError("Space-create lock not acquired for user {UserId}: sp_getapplock returned {LockResult}")`.
Verified firing with the real code: `... returned -1`. Distinct from the FR-4 race-lost warning,
so timeouts and ordinary races are separable in logs.

**Plan-boundary re-checks post-fix (first-hand):** Free 25-way concurrent → 1×200 / 24×403 /
0×500, count held at **2** (cap intact); Pro 10-way → 10/10×200 with zero lock lines (Free
cannot reach the unlocked branch; Pro is not serialized).

---

## Verification checklist (original — now executed; see Resolution above)
- [x] **S-J1 (fail-closed on non-granted lock):** temporarily set `@LockTimeout=0` (return immediately if the resource is held) and, from two sessions, hold the per-user lock in one while firing a create in the other — confirm the second request is **rejected/rolled back (no insert)**, not committed over cap. Then restore the timeout and confirm normal single-request creates still succeed.
- [ ] **S-J1 (return-code wired):** with the fix in place, force a `-999` (pass a deliberately invalid `@LockMode` in a throwaway test) and confirm the handler rejects rather than inserting.
- [ ] **Race still closed under fan-out:** Free user at exactly 1 space, fire N=5 concurrent `POST /api/spaces` with the same bearer — end with **exactly 2** spaces, losers return `403 {plan:["spaces"]}`, one `Warning "Space cap race lost"` per loser. Repeat 3× (regression guard for the primary bug).
- [ ] **Cross-user non-serialization:** two different users firing concurrent creates do not block each other (distinct `@Resource`).
- [ ] **Pro non-regression:** Pro user concurrent creates all succeed, no lock, no race warning.
