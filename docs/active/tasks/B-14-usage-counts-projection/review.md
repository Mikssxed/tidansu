# Code Review: B-14 · Account usage counts via projection (SC-1)

**Date**: 2026-07-15
**Reviewer**: branch-code-reviewer agent
**Diff base**: working tree vs `HEAD` (`a3a1b78`), scoped to B-14's six source files
**Files changed**: 6

> **Scope note.** The working tree carries deliberately-uncommitted changes from
> B-7/B-10/B-11/B-12/B-13. Two of B-14's files (`ISpacesRepository.cs`,
> `SpacesRepository.cs`) show intermixed hunks from B-12
> (`AddWithinSpaceCapAsync`, `HashUserIdForLock`, the `ILogger` ctor param).
> Those are **not** reviewed here — they belong to a prior, already-reviewed task.
> Only the `GetItemCountsPerSpaceAsync` hunks in those two files are in scope.

## Summary
This is a clean, disciplined LIGHT-path change that does exactly what the plan
approved and nothing else. All four load-bearing invariants hold: the zero-spaces
guard survived the signature change verbatim, the ownership filter is present and
exactly as strict as its neighbours, the `Count`/`Sum`/`Max` semantics are provably
equivalent to the old `List<Space>` version, and all three call sites moved while
`GetSpacesQueryHandler` correctly stayed on `GetAllByUserAsync`. **No Critical or
Major findings. Recommend merge.**

The developer's EF SQL claim checks out against the code and schema (see
Verification Audit below) — I was able to corroborate it independently rather
than take it on faith.

## 🔴 Critical (must fix before merge)
None.

## 🟠 Major (strongly recommended)
None.

## 🟡 Minor (nice-to-have)

### [N1] The load-bearing zero-spaces guard has no automated regression test
**File**: `src/Tidansu.Application/Account/Dtos/UsageDto.cs:14`
**Category**: Correctness (defence-in-depth)
**Description**: `FullestSpace = itemCountsPerSpace.Count == 0 ? 0 : itemCountsPerSpace.Max()`
is the only thing standing between a zero-space user and an `InvalidOperationException`
→ 500 on **every new signup's first account-page load**. It is currently protected
by nothing but a code comment and this review. A future contributor "simplifying"
the ternary away gets a green build, green `dotnet test`, and a production incident
that only fires for brand-new users — the exact cohort least likely to report it.

This is **already acknowledged and accepted** at the tech-planning gate
(`tech-tasks.md` §5 Open Question 1): `tests/Tidansu.Domain.Tests` references
`Tidansu.Domain` only, and this rule lives in `Tidansu.Application`, so pinning it
would require either an Application project reference or moving the math into
Domain — new structure this task correctly declined to invent unilaterally.

**Recommendation**: Not a blocker, and **do not fix it in this task** — that would
be the scope creep the plan explicitly guarded against. Worth raising as a
standalone backlog item about the test project's scope, since B-14 has now added a
second reason to want an Application-level test home. The manual matrix (case 1)
covered this for *this* change; the gap is about the *next* change.

### [N2] `GetAllByUserAsync` is now a single-caller method
**File**: `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs:13`
**Category**: Architecture (tech debt, pre-existing)
**Description**: With three of four callers moved off it, `GetAllByUserAsync`'s
`Include`+`AsSplitQuery` shape now serves exactly one call site
(`GetSpacesQueryHandler`) and could be renamed/narrowed to say so.
**Recommendation**: Correctly out of scope here (`tech-tasks.md` §5 Open Question 2)
— it overlaps B-16's photo-payload work on the same method. Noting only so it
isn't lost. Leaving the method undeleted was the right call.

## 🧭 Convention Violations (project rules)
None. No frontend surface (template purity / tokens / Kiota N/A), no layer leaks,
no EF/DbContext reference in Application or Domain, no business logic in
Infrastructure.

## 🏗️ Architecture Notes

**Layer discipline holds.** The repository returns raw counts (`List<int>`) and
derives nothing; the "fullest space = max" rule stays in Application where it lives
today. This is the grain `CountByUserAsync` already uses. The rejected alternative
(a `UserUsageCounts` record returned from Infrastructure) would have pushed
derivation down a layer — the plan was right to decline it.

**No new abstraction, no debt added.** The change *removes* a DRY-adjacent smell
(three sites paying the same full-graph cost) rather than adding one. The
`UsageDto.From` seam is preserved as the single shared computation point, so no
call site can drift onto a different rule (FR-3).

**Scope discipline was exemplary.** Verified absent, all correctly: no EF migration
(no model change), no Kiota regen (`AccountDto`/`UsageDto` property sets byte-identical),
no caching layer, no new Domain type, no `.AsNoTracking()` on `GetAllByUserAsync`
(B-8 SC-2, correctly deferred), no photo-payload work (B-16, correctly deferred).
Nothing in the diff exceeds the approved plan.

**An unremarked consistency improvement.** The old path used `AsSplitQuery()`, whose
constituent queries run without an enclosing transaction and can therefore observe
mid-flight writes across the split — meaning the three meters could in principle
disagree with each other under concurrent mutation. The new single-statement
projection is atomic, so this class of skew is gone. A side benefit, not a
regression, but worth recording as a second reason the shape is right.

## ✅ Verification Audit (checking the developer's claim, not trusting it)

The reported SQL was a single
`SELECT (SELECT COUNT(*) FROM [Item] …) FROM [Spaces] WHERE [UserId] = @userId`
with no Photo/Zones. Independently corroborated:

1. **The shape matches the code.** `.Where(...).Select(s => s.Items.Count)` names
   only `COUNT(*)`; EF emits a correlated subquery in one statement. No `Include`,
   so no zone/item/photo column can be selected. **No N+1** — one statement, not
   one per space.
2. **The table names corroborate a real log read.** The claim says `[Item]`
   (singular) and `[Spaces]` (plural). That asymmetry is real —
   `TidansuDbContext:11` declares `DbSet<Space> Spaces` while `Item` has no DbSet
   and falls back to its type name, confirmed in
   `Migrations/20260621142555_SpacesZonesItems.cs:14,38`. The *plan's* idealized
   text said `FROM Items i`. Reciting the plan would have produced `Items`; the
   report says `Item`. The claim came from observation.
3. **`Photo` really is the payload at stake.** `TidansuDbContext:94-107` leaves
   `Item.Photo` at `nvarchar(max)` by design ("Photos may be data URLs"), so the
   comment's rationale is accurate, not decorative.
4. **`dotnet build src/Tidansu.API` — green, 0 warnings, 0 errors** (re-run by me).
   Per the plan this is the real proof of call-site coverage: the `UsageDto.From`
   signature change would fail the build at any missed site.
5. **Call-site coverage — grep-confirmed exhaustive.** `UsageDto.From` has exactly
   three callers (`GetAccountQueryHandler.cs:22`, `ChangePlanCommandHandler.cs:38`,
   `SetSyncCommandHandler.cs:38`), all on the new path.
   `GetItemCountsPerSpaceAsync` has exactly those same three callers.
   `GetAllByUserAsync` retains exactly one: `GetSpacesQueryHandler.cs:15` — correct
   and intended, not an oversight.

## 🔒 Security (the one line that mattered)

**Ownership filter: present and exactly as strict as its neighbours.**
`SpacesRepository.cs:39` applies `.Where(s => s.UserId == userId)` **before** the
`Select`, character-identical to `GetAllByUserAsync:15` and semantically identical
to `CountByUserAsync:30`. No predicate dropped, none loosened.

**`userId` provenance verified in all three handlers.** Each reads
`userContext.GetCurrentUser().Id` (`GetAccountQueryHandler.cs:17`,
`ChangePlanCommandHandler.cs:21`, `SetSyncCommandHandler.cs:21`) — never from the
request body. No cross-account count leak is reachable.

**No new disclosure surface.** Same three integers, same authenticated user, same
endpoints. Returns ints only — nothing loggable to leak, and no `logger.Log*` of
counts was added.

## 📐 Behaviour equivalence (FR-1/FR-2)

Proven equivalent for every shape in the matrix:

| | Old (`List<Space>`) | New (`List<int>`) | Equivalent? |
|---|---|---|---|
| `Spaces` | `spaces.Count` | `itemCountsPerSpace.Count` | ✅ one element per space |
| `Items` | `spaces.Sum(s => s.Items.Count)` | `itemCountsPerSpace.Sum()` | ✅ same addends, order-independent |
| `FullestSpace` | `spaces.Count == 0 ? 0 : spaces.Max(s => s.Items.Count)` | `itemCountsPerSpace.Count == 0 ? 0 : itemCountsPerSpace.Max()` | ✅ guard intact, same multiset → same max |

- **Zero spaces** → empty `List<int>`, never a SQL `NULL`: `.Count`→0, `.Sum()`→0
  (LINQ-to-Objects `Sum` over empty is 0, does not throw), `.Max()` short-circuited
  by the guard. `0/0/0`, no throw. ✅
- **Spaces with zero items** → `s.Items.Count` yields `0` per space (a correlated
  `COUNT(*)` over zero rows is `0`, not NULL — it's a subquery in the SELECT list,
  not an aggregate over an empty outer set). ✅
- **Ties** → `Max` over the multiset returns the shared value; which space "wins" is
  unobservable since space identity is discarded. Order being unspecified (as the
  XML doc states) is therefore harmless — all three operations are order-invariant. ✅
- **Hard deletes only** — no `HasQueryFilter` anywhere in source (grep-confirmed), no
  `IsDeleted`/`Archived` on `Space`, so there is no inclusion rule the old path applied
  that the new one could miss. ✅
- **Plan caps unaffected (FR-4)** — grep confirms no handler uses
  `GetItemCountsPerSpaceAsync` to *decide* a cap; it only feeds `UsageDto`. The
  authoritative check remains `AddWithinSpaceCapAsync`'s in-lock re-count (B-12).
  Downgrade still reports true counts (no clamping added). ✅

## 👍 Positives
- **The guard survived — verified, not assumed.** The single highest-risk line in
  the diff (`UsageDto.cs:14`) is intact and semantically identical.
- **The interface doc encodes the contract, not the implementation.** The
  empty-list-not-null guarantee and the "order is unspecified" caveat are stated on
  `ISpacesRepository.cs:11-17` where callers can see them. FR-2's `0/0/0` now rests
  on a documented promise rather than an accident of the impl.
- **The Infrastructure comment (`SpacesRepository.cs:32-36`) is genuinely load-bearing.**
  It records *why* this isn't `GetAllByUserAsync` + count and cites B-8 SC-1. This
  is precisely the "simplification" a future maintainer would otherwise make — it
  explains the non-obvious, which is what comments are for.
- **`.AsNoTracking()` correctly omitted, and the reasoning documented.** A scalar
  projection materializes no entities, so it would be a misleading no-op. Resisting
  a reflexive "best practice" that doesn't apply is a judgment call, made correctly.
- **Verified by observing the mechanism, not the outcome.** The developer read the
  SQL log rather than concluding from correct numbers — "it still shows the right
  numbers" would not have distinguished the fix landing from it not landing at all.
  That's the right instinct for a zero-behaviour-change performance task.

## Action Checklist
- [ ] *(no Critical or Major items — nothing blocks merge)*
- [ ] [N1] Optional, **separate** backlog item: give `UsageDto.From`'s zero-spaces
      guard an automated test home (needs a decision on the test project's scope).
      Do not fold into B-14.
- [ ] [N2] Already tracked — `GetAllByUserAsync` narrowing rides along with B-16.
