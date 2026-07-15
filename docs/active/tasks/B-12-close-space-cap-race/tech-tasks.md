# B-12 · Tech tasks — Close the Free space-cap concurrency race (S-1)

## Mechanism decision (the tech-lead call the brief left open)

**Chosen: a per-user application lock (`sp_getapplock`, exclusive,
transaction-scoped) wrapping an authoritative re-count + insert inside one
explicit EF transaction, exposed behind a new repository method.** The handler
keeps `PlanPolicy` (the business decision); the repository owns atomicity and
locking (the infrastructure concern). The seam between them is deliberately
thin: the handler passes the finite space cap (an `int`) down and gets back a
`bool` ("inserted" / "rejected at cap") — `PlanPolicy` is **not** pushed into
Infrastructure, and EF/transactions are **not** pulled into Application.

Flow (single deep behaviour, two observable outcomes):

1. **Pre-check (unchanged, cheap, no lock):** the handler still calls
   `CountByUserAsync` + `PlanPolicy.CheckNewSpace`. If it fails → an *ordinary
   at-cap* rejection (or a zones/items/photos rejection), thrown exactly as
   today. No lock is taken, so the common single-request path and the normal
   at-cap path keep their current behaviour and latency (FR-3).
2. **Finite-cap plans only (Free):** if the pre-check passes, the handler calls
   the new atomic repo method. Inside one transaction it takes an exclusive
   per-user app-lock, **re-counts authoritatively**, and inserts only if still
   under cap. A concurrent request for the same user blocks on the lock, then
   re-counts, sees the cap, and is rejected — this is the *race-lost* branch
   (FR-1, FR-2, FR-4).
3. **Unlimited plans (Pro):** `caps.Spaces` is `null` → the handler skips the
   lock entirely and inserts via the existing `AddAsync`. Pro concurrent
   creation is never serialized and never gains an artificial failure mode
   (FR-3).

### Why not the two alternatives

- **DB-level per-user row-count constraint / unique index — rejected.** The cap
  is *plan-variable* (Free = 2, Pro = unlimited) and Pro must stay unlimited. A
  static "≤ 2 spaces per user" constraint would break Pro; encoding the plan
  into the schema means re-migrating on every plan change and duplicating the
  `PlanCaps` source of truth into SQL. Poor locality, wrong layer for the
  business rule.
- **`SERIALIZABLE` transaction + retry loop — rejected as heavier than needed.**
  Correct, but it puts a deadlock-prone retry loop on the create path (range
  locks on the count query can deadlock two concurrent inserters), for a race
  the audit itself calls rare/deliberate. `sp_getapplock` on a *single* per-user
  resource cannot deadlock (each transaction acquires exactly one lock), is
  uncontended-cheap, and serializes only same-user creates.

### Migration & Kiota

- **No EF migration.** No entity field, index, or `TidansuDbContext` model
  change — `sp_getapplock` is a runtime call, not schema. A migration task is
  deliberately **not** included; a checkbox below records that this was checked.
- **No Kiota regeneration.** The controller signature, request/response DTO, and
  route are unchanged; race-losers reuse the existing `PlanLimitException` →
  403 `{plan:["spaces"]}` path in `ErrorHandlingMiddleware`. Confirmed below.

---

## 📋 Technical Tasks

### Backend — Domain

- [x] modify `ISpacesRepository` in `src/Tidansu.Domain/Repositories/ISpacesRepository.cs`
      — add `Task<bool> AddWithinSpaceCapAsync(Space space, int spaceCap, CancellationToken cancellationToken = default)`
      returning `true` when the space was inserted and `false` when the
      authoritative in-lock re-count was at/over `spaceCap`. XML-doc it as
      "atomically inserts only if the user is still under `spaceCap`, serializing
      concurrent same-user creates" so the contract (not the SQL) is the
      documented seam.

### Backend — Application

- [x] modify `CreateSpaceCommandHandler.Handle` in
      `src/Tidansu.Application/Spaces/Commands/CreateSpace/CreateSpaceCommandHandler.cs`
      to split the single check-then-insert into: (a) the existing pre-check
      (`CountByUserAsync` + `PlanPolicy.CheckNewSpace`) — unchanged, throws
      `PlanLimitException(reason)` on failure with **no** race log; then (b) for
      finite-cap plans, the atomic path. Concretely:
  - Read the cap once via `PlanCaps.For(user.Plan).Spaces`.
  - If it is `int spaceCap` (Free): call `spaces.AddWithinSpaceCapAsync(entity, spaceCap, ct)`.
    On `false`, log **FR-4** and throw `PlanLimitException(PlanLimitReasons.Spaces)`
    (same 403 as an ordinary at-cap — FR-2).
  - If it is `null` (Pro/unlimited): call the existing `spaces.AddAsync(entity, ct)`
    (unchanged path — FR-3).
      (Keeps `PlanPolicy` + `PlanCaps` — the business rule — in Application; the
      repo never learns about plans.)
- [x] add the **FR-4** race-lost signal in the same handler: on the
      `AddWithinSpaceCapAsync == false` branch, `logger.LogWarning("Space cap race lost for user {UserId}: concurrent create rejected at cap {Cap}", userId, spaceCap);`
      *before* throwing. This is the only place the race is logged; the ordinary
      at-cap rejection stays on the pre-check branch (already logged at
      `Information` by the middleware), keeping the two rejections distinguishable
      in logs. No PII beyond the `userId` already logged elsewhere.

### Backend — Infrastructure

- [x] add `AddWithinSpaceCapAsync` implementation in
      `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs`:
  - Open one explicit transaction (`await using var tx = await dbContext.Database.BeginTransactionAsync(ct);`),
    matching the existing transaction precedent in `StripeBillingService.ProcessOnceAsync`.
  - Acquire an **exclusive, transaction-owned** per-user app-lock with a bounded
    timeout, using a **parameterized** resource string (never string
    concatenation — see Security):
    `await dbContext.Database.ExecuteSqlInterpolatedAsync($"EXEC sp_getapplock @Resource={resource}, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout={5000}", ct);`
    where `resource = $"tidansu:space-create:{space.UserId}"`.
  - Re-count inside the lock (`dbContext.Spaces.CountAsync(s => s.UserId == space.UserId, ct)`);
    if `>= spaceCap`, roll back and `return false`.
  - Otherwise `dbContext.Spaces.Add(space)`, `SaveChangesAsync(ct)`,
    `tx.CommitAsync(ct)`, `return true`. The lock releases on commit/rollback.
  - Comment the *why* on the lock line: single-resource exclusive lock → cannot
    deadlock, serializes only same-user creates, no effect on other users or Pro.
- [x] verify **no migration is required** for this change (no entity/model/index
      change; `sp_getapplock` is runtime, not schema) — record it here rather
      than run `dotnet ef migrations add`. If review disagrees, that is the only
      trigger to add one.
- [x] confirm **no DI change** needed — `ISpacesRepository`/`SpacesRepository`
      is already registered in
      `src/Tidansu.Infrastructure/Extensions/ServiceCollectionExtensions.cs`
      (line ~146). No edit expected; listed so the developer verifies rather than
      assumes.

### Backend — API

- [x] confirm `SpacesController.CreateSpace` and `CreateSpaceCommand` are
      **unchanged** — no route/DTO/signature edit. The 403 `{plan:["spaces"]}`
      contract is produced by the existing `PlanLimitException` arm of
      `ErrorHandlingMiddleware`; nothing to add there.

### Frontend

- [x] **No Kiota regeneration** (`npm run build:api`) — response contract
      unchanged; skip. Recorded so the developer does not run it out of habit.
- [x] **No frontend task.** The client already opens the `spaces` paywall on the
      server's 403 `{plan:["spaces"]}`; a race-loser receives the identical body,
      so the existing paywall handling covers it (Gate-1 decision: race-lost is
      indistinguishable from an ordinary at-cap to the client). Verify only.

### Refactoring

- [x] `[refactor]` review the touched files (`CreateSpaceCommandHandler.cs`,
      `SpacesRepository.cs`, `ISpacesRepository.cs`) for layer/SOLID/DRY drift
      introduced by this change. Specifically keep the handler's two rejection
      branches readable (guard-clause style, not nested), and ensure the
      `PlanCaps.For(user.Plan)` call is made once (do not double-evaluate the
      plan). Scope: touched files only — no unrelated refactors. If nothing
      beyond the above: "No refactoring needed in touched files."

---

## 🔒 Security Considerations

- **🟠 High — plan-limit bypass / revenue leak (the bug itself).** Concurrent
  `POST /api/spaces` currently all pass the read-then-insert gate, letting a Free
  user exceed the 2-space cap without paying. This is the whole item.
  - [x] Mitigation: the in-lock authoritative re-count (Infrastructure task
        above) makes the cap hold under any interleaving (FR-1).
- **🟢 Low — SQL injection via the lock resource string.** `sp_getapplock`'s
  `@Resource` is built from `userId`. Building it by string concatenation into
  raw SQL would be injectable.
  - [x] Mitigation: use `ExecuteSqlInterpolatedAsync` so `@Resource` and
        `@LockTimeout` are passed as **parameters**, never concatenated.
        Explicitly reject `ExecuteSqlRaw` with an interpolated `userId`.
- **🟢 Low — lock-hold blast radius / self-DoS.** A stuck lock could block the
  same user's subsequent creates.
  - [x] Mitigation: the exclusive lock is **per-user** (`@Resource` keyed on
        `userId`) and **transaction-owned** (auto-released on commit/rollback),
        with a bounded `@LockTimeout` (5000 ms). Worst case affects one user's
        create path briefly, not the service.
- **🟢 Low — FR-4 log content.** The race-lost `LogWarning` includes only
  `userId` and the cap int — no PII beyond what is already logged; no request
  body. Confirmed acceptable.

## 📈 Scalability / Correctness Considerations

- **Common-path latency (FR-3).** The lock is taken only after the pre-check
  passes *and* only for finite-cap (Free) plans. Uncontended `sp_getapplock` is
  cheap; a single non-concurrent create adds one lock acquire + one extra
  `CountAsync` (indexed on `UserId`, existing index) inside a short transaction.
  Negligible.
  - [x] Verify normal create latency is unchanged in the manual drive.
- **Pro throughput (FR-3).** Pro (`caps.Spaces == null`) bypasses the lock and
  transaction entirely — no serialization of Pro concurrent creates, no new
  failure mode.
  - [x] Verify the Pro branch calls the existing `AddAsync` with no lock.
- **Per-user serialization only.** Different users use different `@Resource`
  keys, so concurrency across users is unaffected; only same-user concurrent
  creates queue (rare, and correct behaviour).
- **EF execution-strategy caveat.** The context uses `UseSqlServer` **without**
  `EnableRetryOnFailure`, so the default non-retrying strategy makes the manual
  `BeginTransactionAsync` safe. If retry-on-failure is ever enabled later, this
  manual transaction MUST be wrapped in
  `dbContext.Database.CreateExecutionStrategy().ExecuteAsync(...)` or it will
  throw at runtime.
  - [x] Add a short code comment noting this coupling so a future retry-enable
        change catches it.
- **No unbounded query / N+1.** The in-lock query is a single scalar `COUNT`; no
  tracking graph is materialized.

## 📦 New Dependencies

No new dependencies required. `sp_getapplock` is a built-in SQL Server / LocalDB
stored procedure; the transaction API is already used in `StripeBillingService`.

## ❓ Open Questions

1. **SQL Server coupling of `sp_getapplock`.** This ties the handler's atomic
   path to SQL Server / LocalDB. Acceptable given the app targets SQL Server and
   there are **no** cross-provider integration tests (only `Tidansu.Domain.Tests`,
   which is pure and unaffected). Confirm there is no plan to run this handler
   against SQLite/in-memory in tests — if there is, the lock must be guarded by a
   provider check. *Recommendation: accept the coupling; the repo is
   SQL-Server-only today.*
2. **Lock-timeout outcome.** On the rare `@LockTimeout` (5000 ms) expiry, the
   transaction fails and the request surfaces as a 500 (generic catch). Given the
   race requires deliberate near-simultaneous fire and per-user scope, a 500 on
   timeout is an acceptable rare edge. Confirm 5000 ms is the desired bound — not
   a blocker.
3. **PM Open Question #1 (client auto-retry on race-lost) — already resolved at
   Gate 1:** treat race-lost identically to an ordinary at-cap (same 403, open
   the same paywall, no "try again" state). No frontend work. Recorded here so it
   is not re-litigated.

---

## ✅ Verification Tasks (no automated suite — drive it)

- [x] `dotnet build` green.
- [x] `npm run build` (vue-tsc) green — confirms the untouched frontend still
      type-checks (no client regen).
- [x] **Happy path (FR-3):** as a Free user with 0–1 spaces, create a space via
      the running app (`/run` or `/verify`) — succeeds normally, same response.
- [x] **Ordinary at-cap (FR-3):** as a Free user already at 2 spaces, create one
      more — existing `spaces` paywall opens; server log shows the `Information`
      "Plan limit hit: spaces" and **no** race-lost warning.
- [x] **Race path (FR-1/FR-2/FR-4):** as a Free user at exactly 1 space, fire
      N (e.g. 5) concurrent `POST /api/spaces` (a small script / `curl` fan-out
      with the same bearer token). Observe: user ends with **exactly 2** spaces
      (never 3+); losing requests each return **403 `{plan:["spaces"]}`** (no
      500, no hang, no half-created space); server log shows a **`Warning`
      "Space cap race lost"** entry for each loser and none for the ordinary
      case. Repeat 2–3× to confirm it is not flaky.
- [x] **Pro non-regression (FR-3):** as a Pro user, fire N concurrent creates —
      **all** succeed (no artificial serialization failure), and no race-lost
      warnings are logged.
</content>
