# B-14 · Technical Tasks — Account usage counts via projection (SC-1)

Source: [`requirements.md`](./requirements.md) (approved 2026-07-15, both open
questions resolved). Weight: **LIGHT** — one repository method (interface + EF
impl), one DTO seam change, three call-site swaps. One coherent diff.

---

## Design decisions (read before writing code)

### 1. The projection shape — per-space item counts, one round-trip

**Chosen:** a single query that projects each of the user's spaces to *just* its
item count, materializing a `List<int>`, then deriving the three numbers in
memory:

```csharp
var perSpaceItemCounts = await dbContext.Spaces
    .Where(s => s.UserId == userId)
    .Select(s => s.Items.Count)
    .ToListAsync(cancellationToken);
```

EF translates this to one round-trip, roughly
`SELECT (SELECT COUNT(*) FROM Items i WHERE i.SpaceId = s.Id) FROM Spaces s WHERE s.UserId = @userId`.
No `Zones`, no `Items` rows, and critically **no `Item.Photo` `nvarchar(max)`
column** ever leaves SQL Server — the projection only names `COUNT(*)`. That is
FR-1's cost fix: N small ints instead of megabytes.

**How this survives the zero-spaces trap (FR-2).** The classic failure is
`MaxAsync` over an empty set: SQL `MAX(...)` over zero rows returns `NULL`, and
EF's `MaxAsync<int>` throws (`Sequence contains no elements`) unless you project
to `int?` and coalesce. **This shape never enters that trap**, because `Max` is
never translated to SQL at all — it runs as LINQ-to-Objects over an already
materialized `List<int>`. Zero spaces means an **empty list, not a NULL**:
`.Count` → `0`, `.Sum()` → `0` (LINQ-to-Objects `Sum` over an empty sequence is
`0` and does not throw), and `.Max()` — the only member that *would* throw on
empty — stays guarded by the exact `Count == 0 ? 0 : ...` ternary that
`UsageDto.From` already has today. The guard is preserved verbatim, not
reinvented.

**Alternatives weighed and rejected:**

| Shape | Why rejected |
|---|---|
| Separate `CountAsync` + `SumAsync` + `MaxAsync` round-trips | Three round-trips instead of one, **and** the `MaxAsync`-over-empty trap is live — it would need `Select(s => (int?)s.Items.Count).MaxAsync() ?? 0` to avoid throwing on a zero-space account. Strictly worse on both cost and correctness. |
| Single `GroupBy(s => 1).Select(g => new { g.Count(), g.Sum(...), g.Max(...) })` aggregate | One row instead of N ints, but zero spaces produces **zero groups** → `FirstOrDefaultAsync` → `null` → needs its own coalesce-to-`0/0/0` guard; and it pushes the "fullest = max" derivation into SQL, i.e. into Infrastructure. Cost saving over N ints is negligible (see Scalability §1). |
| Repository returns the finished three numbers (a `UserUsageCounts` record in Domain) | Deeper interface, but puts derivation in Infrastructure (layer table forbids business logic there) and adds a Domain type — an extra layer this LIGHT path doesn't need. Also risks confusion with the existing Domain `SpaceUsage(Zones, Items, Photos)` used by `PlanPolicy`. |

Do **not** add `.AsNoTracking()`: a projection to a scalar materializes no
entities, so there is nothing to track — it would be a no-op and misleading noise.

### 2. The `UsageDto.From` seam — takes `List<int>`, stays in Application

`UsageDto.From(List<Space>)` has exactly three callers (grep-confirmed: the three
Account handlers; nothing else in the solution or tests). So the signature is free
to change. It becomes `From(List<int> itemCountsPerSpace)` — same file, same
shape, same zero guard. The repository stays at the grain it already uses
(`CountByUserAsync` returns a raw count, no derivation), the "fullest space = max"
rule stays in Application where it lives today, and all three call sites keep
sharing one seam so no site can drift onto a different rule (FR-3). The downstream
`AccountDto.From(user, usage)` call is **unchanged** in all three handlers — that
is what keeps the API shape identical (FR-1: no Kiota regen).

### 3. No migration, no Kiota regen

No entity field, `TidansuDbContext` model, controller signature, route, or DTO
*shape* changes — only how three already-shipped integers are computed. No
`dotnet ef migrations add`, no `npm run build:api`, no frontend task in this
plan. Frontend is untouched.

---

## 1. 📋 Technical Tasks

### Backend — Domain

- [x] Add `Task<List<int>> GetItemCountsPerSpaceAsync(string userId, CancellationToken cancellationToken = default)` to `ISpacesRepository` in `src/Tidansu.Domain/Repositories/ISpacesRepository.cs`
      (purpose-built counts-only read, following the `AddWithinSpaceCapAsync` precedent from B-12: a narrow method that exists for one call pattern, with an XML doc stating the contract callers depend on. Place it next to `CountByUserAsync` — same grain, raw counts, no derivation.)
- [x] Write the XML doc on `GetItemCountsPerSpaceAsync` in `src/Tidansu.Domain/Repositories/ISpacesRepository.cs` stating: returns one element per space owned by the user, each the item count of that space; order is unspecified; **an empty list for a user with no spaces (not null)**; and that it deliberately loads no zones, items, or photo payloads. Match the tone/shape of the `AddWithinSpaceCapAsync` doc block.
      🔒 blocked by: previous task
      (the empty-list-not-null guarantee is the contract FR-2's `0/0/0` rests on — it must be part of the interface, not an accident of the impl.)

### Backend — Infrastructure

- [x] Implement `GetItemCountsPerSpaceAsync` in `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs` as `dbContext.Spaces.Where(s => s.UserId == userId).Select(s => s.Items.Count).ToListAsync(cancellationToken)` — place it directly below `CountByUserAsync`.
      🔒 blocked by: `ISpacesRepository` method added
      (no `.Include`, no `.AsSplitQuery()`, no `.AsNoTracking()` — see Design §1. The `Select` before materialization is the whole point: adding any `Include` silently restores the megabyte load this task exists to remove.)
- [x] Add a short comment above the new impl in `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs` recording *why* it is not `GetAllByUserAsync` + count (the account page needs three integers; the full graph carries `nvarchar(max)` photo data-URLs — B-8 finding SC-1), so a future maintainer doesn't "simplify" it back.
      🔒 blocked by: previous task
- [x] No service registration change needed in `src/Tidansu.Infrastructure/Extensions/ServiceCollectionExtensions.cs` — `SpacesRepository` is already registered against `ISpacesRepository`. Verify only; do not edit.

### Backend — Application

- [x] Change `UsageDto.From(List<Space> spaces)` to `UsageDto.From(List<int> itemCountsPerSpace)` in `src/Tidansu.Application/Account/Dtos/UsageDto.cs`: `Spaces = itemCountsPerSpace.Count`, `Items = itemCountsPerSpace.Sum()`, `FullestSpace = itemCountsPerSpace.Count == 0 ? 0 : itemCountsPerSpace.Max()`.
      🔒 blocked by: repository impl
      (keep the `Count == 0 ? 0 :` guard exactly as-is — it is what stops `.Max()` throwing on a zero-space account, FR-2.)
- [x] Remove the now-unused `using Tidansu.Domain.Entities;` from `src/Tidansu.Application/Account/Dtos/UsageDto.cs`.
      🔒 blocked by: previous task
- [x] Swap `spaces.GetAllByUserAsync(userId, ct)` → `spaces.GetItemCountsPerSpaceAsync(userId, ct)` at `src/Tidansu.Application/Account/Queries/GetAccount/GetAccountQueryHandler.cs:21`; the `AccountDto.From(user, UsageDto.From(...))` line stays structurally identical. Rename the local from `userSpaces` to `itemCountsPerSpace`.
      🔒 blocked by: `UsageDto.From` seam change
- [x] Swap the same call at `src/Tidansu.Application/Account/Commands/ChangePlan/ChangePlanCommandHandler.cs:35`, keeping the projection **after** `billing.ChangePlanAsync(...)` so the returned usage still reflects post-change state (FR-3).
      🔒 blocked by: `UsageDto.From` seam change
- [x] Swap the same call at `src/Tidansu.Application/Account/Commands/SetSync/SetSyncCommandHandler.cs:37`, keeping it after the `userService.UpdateAsync` block (FR-3).
      🔒 blocked by: `UsageDto.From` seam change
- [x] Confirm `src/Tidansu.Application/Spaces/Queries/GetSpaces/GetSpacesQueryHandler.cs:15` is **left untouched** on `GetAllByUserAsync` — it legitimately needs the full graph for the layout view (out of scope; photo slimming is B-16). Do not "clean up" the now-single-caller `GetAllByUserAsync`; do not delete it.

### Backend — API

- [x] No API task. No controller signature, route, or response-shape change — verify `AccountDto`/`UsageDto` property sets are byte-identical to before and that `src/Tidansu.App/src/api/api.json` needs no regeneration.

### Frontend

- [x] No frontend task. No Kiota regen (`npm run build:api` **not** run), no composable/store/component change. `npm run build` is still run as a type-check gate (see Verification) to prove the client still matches.

### Refactoring

- [x] No refactoring needed in touched files. `SpacesRepository` and the three handlers already follow the primary-constructor + one-seam pattern; this task *removes* a DRY-adjacent smell (three sites paying the same full-graph cost) rather than adding one. Explicitly **not** in scope: adding `.AsNoTracking()` to `GetAllByUserAsync` (B-8 finding SC-2, a separate backlog item — do not fold it in here), and the `Item.Photo` payload (B-16).

### Verification

- [x] `dotnet build` from `src/Tidansu.API` — green. (This is the real compile-time gate for the seam change: the `UsageDto.From` signature change will fail the build at any call site missed, which is how you *prove* all three were swapped and none was left behind.)
      🔒 blocked by: all Application tasks
- [x] `dotnet test` from repo root — `tests/Tidansu.Domain.Tests` still green. (No new test: the test project references `Tidansu.Domain` only, and the changed rule lives in `Tidansu.Application`. See Open Question 1 — do **not** add an Application reference or move the math into Domain to force a test; that's a layer this task doesn't need.)
- [x] `npm run build` from `src/Tidansu.App` — vue-tsc type-check green, proving the generated Kiota client still matches the unchanged API shape.
- [x] **Manual end-to-end drive (`run` / `verify` skills).** Before starting, confirm EF SQL logging is on: `src/Tidansu.API/appsettings.Development.json` already sets `Serilog:MinimumLevel:Override:Microsoft.EntityFrameworkCore` to `Information` (B-7 left the *base* `appsettings.json` at `Warning`, so this only works running in the Development environment — check the console prints `Executed DbCommand` before trusting the observation). Then `dotnet run` from `src/Tidansu.API` + `npm run dev` from `src/Tidansu.App`, log in, and drive the matrix below.
      🔒 blocked by: `dotnet build` green
- [x] **Observe the graph is gone (FR-1's actual acceptance).** With the account page loading, watch the Serilog console: the `Executed DbCommand` for the usage read must be a **single** statement selecting only a `COUNT` over `Items` filtered by `Spaces.UserId` — with **no `SELECT` of `Items.Photo`, no `Items.*`, no `Zones` query, and no second/third split query**. Compare against the pre-change behaviour if useful (`git stash`): before, the account page emits the `AsSplitQuery` trio (Spaces + Zones + Items incl. `Photo`); after, one narrow statement. Record what you saw — "it still shows the right numbers" is *not* evidence the fix landed.
      🔒 blocked by: previous task
- [x] **Edge-case matrix — drive each shape and read the account page's three meters (spaces / total items / fullest space):**
      1. **Zero spaces** (fresh account, or delete all spaces) → `0 / 0 / 0`, no error, no 500. This is the trap case (FR-2).
      2. **Spaces with zero items** (create 2 empty spaces) → `2 / 0 / 0`.
      3. **Differing item counts** (e.g. space A = 3 items, space B = 1 item) → `2 / 4 / 3`.
      4. **Tie for fullest** (space A = 3, space B = 3) → `2 / 6 / 3` — the shared count; either space "winning" is fine.
      5. **A space with a photo item** (Pro) → numbers correct **and** the SQL still shows no `Photo` column selected.
      🔒 blocked by: EF SQL observation task
- [x] **All three surfaces (FR-3), each showing correct usage in its own response:**
      1. Account page load (`GET /api/account`) — meters correct.
      2. **Plan change** — toggle plan on the account page; the `ChangePlan` response's embedded account must carry the same three numbers (watch the network response, not just the re-render, since the page may refetch and mask a wrong inline value).
      3. **Sync toggle** — flip sync on/off as Pro; the `SetSync` response's account must likewise carry correct usage.
      Confirm the same narrow SQL fires on all three, not just the page load.
      🔒 blocked by: edge-case matrix
- [x] **Plan-cap / paywall non-regression (FR-4).** As a **Free** user: at exactly 2 spaces, attempt a 3rd → paywall opens with `reason: spaces` exactly as before. Then confirm the account page's meters read `2 / …` consistently with that rejection (the numbers the user sees and the number the cap check used must agree).
      🔒 blocked by: three-surfaces task
- [x] **Downgrade / read-only path (FR-4).** With an over-cap account (e.g. 3 spaces created while Pro), downgrade to Free → data is kept, the account page still reports the true counts (`3 / …`, not a clamped `2`), and over-cap content is read-only per the existing `PlanPolicy` rule. This task must not make usage numbers lie about over-cap accounts.
      🔒 blocked by: previous task

---

## 2. 🔒 Security Considerations

- 🟢 **Low — user scoping preserved.** The new projection must keep the
  `Where(s => s.UserId == userId)` filter; it is the only thing preventing a
  cross-tenant count leak. It is applied *before* the `Select`, identically to
  `CountByUserAsync`.
  - [x] Confirm `GetItemCountsPerSpaceAsync` filters on `s.UserId == userId` and
        that `userId` comes from `userContext.GetCurrentUser().Id` (never from
        the request body) in all three handlers — unchanged from today, verify
        not regressed.
- 🟢 **Low — no new logging surface.** The new method returns integers; there is
  no credential, email, or photo payload to leak into logs.
  - [x] Do not add a `logger.Log*` of the returned counts or the raw SQL to the
        repository — EF's existing Development-only SQL logging is sufficient for
        verification and is already scoped to `Information` in dev / `Warning` in
        the base config.
- 🟢 **Low — usage numbers are not a new disclosure.** The same three integers
  are already returned to the same authenticated user by the same endpoints; no
  new information crosses the wire.

No 🔴/🟠 items. This is a read-path cost change with no new surface, no new
input, and no authz decision moved.

---

## 3. 📈 Scalability / Correctness Considerations

1. **N ints per user is the remaining (acceptable) unboundedness.** The
   projection returns one `int` per space, so a Pro user with unlimited spaces
   returns an unbounded-in-principle row count. At 4 bytes/row this is
   negligible against today's multi-megabyte graph, and it is bounded in practice
   by how many spaces a human maps. The one-row `GroupBy` aggregate would remove
   even this, at the cost of a fragile translation and its own zero-groups guard
   (Design §1).
   - [x] Accept N ints; **do not** add paging or a `Take()` to the projection —
         truncating it would silently under-count and break FR-1/FR-4.
2. **No N+1.** `Select(s => s.Items.Count)` is a correlated subquery inside one
   statement, not a per-space query. Verify in the SQL log that exactly **one**
   `Executed DbCommand` fires for the usage read.
   - [x] Confirm a single statement in the Serilog console during the manual
         drive (see Verification).
3. **`.Max()` on empty is the one throwing path.** LINQ-to-Objects `Max()` over
   an empty `List<int>` throws `InvalidOperationException` → a 500 via
   `ErrorHandlingMiddleware` for every zero-space user, i.e. every new signup's
   first account-page load. The `Count == 0 ? 0 :` guard is load-bearing.
   - [x] Keep the guard in `UsageDto.From`; drive the zero-spaces case explicitly
         (Verification matrix case 1) rather than assuming it.
4. **Tracking.** Scalar projections materialize no entities, so nothing enters
   the change tracker — a strict improvement over `GetAllByUserAsync`, which
   tracks the whole graph on these read paths today (B-8 SC-2).
   - [x] Do not add `.AsNoTracking()` (no-op here); leave B-8 SC-2's fix to
         `GetAllByUserAsync` for its own backlog item.
5. **Counts are read outside any lock — and that's correct.** These are display
   meters, not the cap decision. The authoritative at-cap check stays inside
   `AddWithinSpaceCapAsync`'s per-user `sp_getapplock` re-count (B-12). This task
   must not be read as moving cap enforcement onto the projection.
   - [x] Confirm no handler starts using `GetItemCountsPerSpaceAsync` to *decide*
         a cap — it only feeds `UsageDto`.

---

## 4. 📦 New Dependencies

No new dependencies required. No `.csproj` or `package.json` change; no EF
migration; no Kiota regeneration.

---

## 5. ❓ Open Questions

1. **Automated coverage for the fullest-space rule is structurally unavailable —
   accepted, not blocking.** `tests/Tidansu.Domain.Tests` references
   `Tidansu.Domain` only, and the rule lives in `Tidansu.Application`
   (`UsageDto.From`). Covering the zero/empty/tie cases as unit tests would need
   either an Application project reference in the test csproj or moving the math
   into `Domain` — both are new structure this LIGHT task shouldn't invent
   unilaterally. **Proceeding with manual verification** (the matrix above covers
   every FR-2 shape). If the team wants this rule pinned by a test, that's a
   standalone decision about the test project's scope.
2. **`GetAllByUserAsync` drops to a single caller** (`GetSpacesQueryHandler`)
   after this change. That's a real deepening opportunity — the method's
   `Include`+`AsSplitQuery` shape now serves exactly one layout-view call site
   and could be renamed/narrowed to say so. **Deliberately out of scope here**
   (it overlaps B-16's photo-payload work on the same method). If the team wants
   that seam re-cut properly, run `design-an-interface` from the main session —
   the tech-lead agent cannot fan out to it.

No other open questions — both requirements-gate questions (three-call-site
scope; soft-delete) are resolved and are not re-raised.
