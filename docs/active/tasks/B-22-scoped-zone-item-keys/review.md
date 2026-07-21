# Code Review: main (uncommitted working tree) — B-22 scoped zone/item keys

**Date**: 2026-07-21
**Reviewer**: branch-code-reviewer agent
**Diff base**: `HEAD` (700c166) — changes are uncommitted in the working tree, not on a branch
**Files changed**: 8 source files (+2 new: `SpaceCollectionCaps.cs`, the migration pair)
**Scope note**: a `security-reviewer` agent owns trust boundaries / secret leakage / fail-open.
This report covers **correctness, convention, scope creep, and dead/misleading code**.

## Summary

The core of this change is right, and unusually well-evidenced. The composite-key swap is
correct and complete: the migration genuinely is zero-row and cannot fail, no EF API in the
codebase depended on `Id` alone identifying a row, and the `RemoveItemAsync` refactor is
provably behaviour-preserving. The `DependentRules` short-circuit works exactly as intended —
I verified it empirically, not by reading.

Two defects remain, both in `SpaceDtoValidator`, and both cause the exact outcome AC-5 and
FR-3 forbid — a **500 instead of a clean 400**. The new intra-request duplicate-id rule
compares ids with .NET ordinal semantics while the primary key it protects is enforced under
`SQL_Latin1_General_CP1_CI_AS`, so `["z1","Z1"]` sails past validation into a PK violation;
and the new collection-cap rules dereference `.Count` on a collection that an explicit JSON
`null` leaves null. Neither is a security hole or a data-loss risk, so nothing here blocks
merge — but the duplicate-id rule does not fully deliver the acceptance criterion it was
written for. No scope creep; the diff touches only what the plan named.

## 🔴 Critical (must fix before merge)

None.

## 🟠 Major (strongly recommended)

### [M1] Intra-request duplicate-id rule is case-sensitive; the key it guards is not — the 500 it exists to prevent is still reachable

**File**: `src/Tidansu.Application/Spaces/Dtos/SpaceDtoValidator.cs:57-61` (`HasNoDuplicateIds`),
used at `:41-43` and `:54-56`
**Category**: Correctness / Functional (AC-5, FR-3, FR-5)

`HasNoDuplicateIds` uses `ids.Distinct()`, which is `EqualityComparer<string>.Default` —
ordinal, case-sensitive, whitespace-significant. The constraint it is protecting is the new
`PK_Zone` / `PK_Item` on `(SpaceId, Id)`, compared under the database's collation. I confirmed
that collation on the live dev database:

```
DATABASEPROPERTYEX('TidansuDb','Collation') -> SQL_Latin1_General_CP1_CI_AS
sys.columns Zone.Id / Zone.SpaceId          -> SQL_Latin1_General_CP1_CI_AS
```

`CI` = case-**insensitive**, and SQL Server additionally ignores trailing whitespace in
`nvarchar` equality. So two ids that the validator considers distinct can be the same key.
I verified both halves end-to-end.

Validator (ran `SpaceDtoValidator.Validate` directly against the shipped code):

```
[case-differing ids z1/Z1]        validatorValid=True   dupRuleFired=False
[trailing-space ids 'z1'/'z1 ']   validatorValid=True   dupRuleFired=False
[ToEntity] built graph with 2 zones -> reaches DB insert
```

Database (a scratch table with the identical composite PK):

```
case-differing:  REJECTED -> Violation of PRIMARY KEY constraint. The duplicate key value is (s1, Z1).
trailing-space:  REJECTED -> Violation of PRIMARY KEY constraint. The duplicate key value is (s1, z1 ).
```

The full path is therefore: `POST /api/spaces` with `zones: [{"id":"z1"},{"id":"Z1"}]` →
validator passes → `SpaceDto.ToEntity` builds the graph (EF's change tracker also uses ordinal
comparison in memory, so it does not catch it either) → `SaveChangesAsync` → PK violation →
`DbUpdateException` → **500**. That is precisely the outcome the rule was added to eliminate,
and `tech-tasks.md`'s "Conclusion" for this task ("is now rejected by `SpaceDtoValidator`'s
duplicate-id rule ... before `CreateSpaceCommandHandler.Handle` runs") overstates the coverage.

Note the asymmetry that makes this easy to miss: the **handler** pre-checks are not affected.
`ZoneExistsInSpaceAsync` / `ItemExistsInSpaceAsync` evaluate `z.Id == zoneId` in SQL, so they
inherit the CI collation and correctly reject a case-differing duplicate. Only the in-memory
`CreateSpace` graph path is exposed.

**Recommendation**: make the in-memory comparison match the storage comparison. A `HashSet`
also removes the double allocation in the current implementation:

```csharp
private static bool HasNoDuplicateIds<T>(IEnumerable<T> entries, Func<T, string> idSelector)
{
    // Ordinal-ignore-case + TrimEnd mirrors SQL_Latin1_General_CP1_CI_AS, which is what
    // PK_Zone/PK_Item are actually compared under — an ordinal Distinct() lets "z1"/"Z1"
    // and "z1"/"z1 " through into a DbUpdateException 500 (B-22 M1).
    var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    return entries.All(e => seen.Add(idSelector(e).TrimEnd()));
}
```

Belt-and-braces alternative worth considering alongside it: constrain `Id` in
`ZoneDtoValidator` / `ItemDtoValidator` to `^[A-Za-z0-9_-]{1,64}$`, which makes ordinal and
collation comparison agree by construction rather than by a comparer that a future edit can
quietly change back.

### [M2] The new collection-cap rules NRE into a 500 on an explicit JSON `null` collection

**File**: `src/Tidansu.Application/Spaces/Dtos/SpaceDtoValidator.cs:28` and `:51`
**Category**: Correctness / Functional (AC-5)

`.Must(zones => zones.Count <= …)` dereferences `zones`. The `= []` initializer on
`SpaceDto.Zones` / `SpaceDto.Items` only covers an **omitted** JSON key —
`System.Text.Json` writes an explicit `null` straight over it, and the API does not opt into
`RespectNullableAnnotations` (`WebApplicationBuilderExtensions.cs:101-104` configures only
`JsonStringEnumConverter`). FluentValidation invokes `Must` regardless of null and does not
catch exceptions from the predicate, so the NRE escapes `ValidationBehavior` into
`ErrorHandlingMiddleware`'s catch-all. Verified against the shipped validator:

```
[3] null Zones THREW: NullReferenceException: Object reference not set to an instance of an object.
```

This is **not a regression** — `RuleForEach` is null-safe, so before this change the same
payload reached `CreateSpaceCommandHandler.cs:30` (`dto.Zones.Count`) and NRE'd there instead.
But this task's own AC-5 is "exceeding it is a clean validation error, not a 500", and this
diff introduces the first rule in the file whose stated purpose is that guarantee. It is a
one-line fix at the point of change. This is the second occurrence of this exact shape in the
repo (the first was B-13's `ItemDtoValidator` `Tags` rule).

**Recommendation**: add `.NotNull()` ahead of each `.Must(...)`. It also yields a properly
field-attributed error key rather than a generic 500:

```csharp
RuleFor(s => s.Zones)
    .NotNull()
    .Must(zones => zones.Count <= SpaceCollectionCaps.ZoneCollectionMax)
    .WithMessage(...)
    .DependentRules(() => { ... });
```

`DependentRules` already handles the rest: `NotNull` failing short-circuits the dependent
block, so no downstream rule sees the null. `CreateSpaceCommandHandler.cs:30` has the same
shape and becomes unreachable once the validator guards it.

## 🟡 Minor (nice-to-have)

### [N1] The new `DbUpdateException` clause is behaviourally identical to the catch-all it sits above

**File**: `src/Tidansu.API/Middlewares/ErrorHandlingMiddleware.cs:184-210`
**Category**: Dead/duplicated code

Lines 197-209 are a verbatim copy of the catch-all's body at 215-227 — same status, same
`GeneralErrorKey`, same `"Something went wrong."`. Delete the clause and every HTTP response
is byte-for-byte unchanged; the only real effect is a distinct log line
(`"Persistence failure: {Message}"` vs `ex.Message`). That log distinction is worth keeping,
so I am not asking for removal — but the block's own comment asserts an invariant ("the body
is byte-identical to the catch-all below") that nothing enforces. A maintainer who reworded
the catch-all's message would break the stated property silently, and the security argument
resting on it. Make it structural:

```csharp
catch (DbUpdateException ex)
{
    logger.LogError(ex, "Persistence failure: {Message}", ex.Message);
    await WriteGenericErrorAsync(context);
}
catch (Exception ex)
{
    logger.LogError(ex, ex.Message);
    await WriteGenericErrorAsync(context);
}
```

(Deferring the leakage question itself to the security reviewer — this is the DRY/enforcement
half only.)

### [N2] `RemoveItemAsync`'s new comment misstates why the old query was correct

**File**: `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs:437-442`
**Category**: Misleading code

**The refactor itself is correct and behaviour-preserving** — I checked the predicate algebra.
Old: `i.Id == itemId AND EXISTS(s.Id == spaceId AND s.Id == i.SpaceId AND s.UserId == userId)`.
The `s.Id == spaceId ∧ s.Id == i.SpaceId` conjunct already entails `i.SpaceId == spaceId`, so
the new form is logically equivalent, just stated explicitly. Good change.

The comment's justification is wrong, though. It says the scoping "used to be only implied …
**because** Id was globally unique table-wide, so `i.Id == itemId` alone could only ever match
one row regardless of space." Global uniqueness was never load-bearing here — the correlated
EXISTS carried the space scope on its own. As written, the comment tells a future reader that
the pre-B-22 code had a latent tenancy hole that the composite key would have opened. It
didn't. Reword to: the scoping was previously implied transitively through the EXISTS and is
now stated directly, because a predicate that depends on reading a subquery to establish
tenant scope is a tripwire waiting to be "simplified".

### [N3] Same class of misattribution in the duplicate-id rule's comment

**File**: `src/Tidansu.Application/Spaces/Dtos/SpaceDtoValidator.cs:33-37`
**Category**: Misleading code

"with the composite `(SpaceId, Id)` key, two zones sharing an id within the SAME request throw
an EF change-tracker `InvalidOperationException`" — that was equally true under the old
single-column `Id` key; duplicate ids in one graph collided on the tracker either way. The
rule is a genuinely good addition, it just wasn't created by B-22. Drop the "with the composite
key" clause so the rule doesn't read as B-22-specific and get removed if the key ever changes
again.

### [N4] `HasNoDuplicateIds` allocates twice over the collection

**File**: `src/Tidansu.Application/Spaces/Dtos/SpaceDtoValidator.cs:57-61`
**Category**: Correctness/cost

`entries.Select(...).ToList()` then `Distinct().Count()` materialises the ids twice for up to
5,000 items. The `HashSet` form in M1 is one pass and one allocation, and fixes M1 at the same
time — treat these as a single edit.

### [N5] Inline fully-qualified EF type name

**File**: `src/Tidansu.API/Middlewares/ErrorHandlingMiddleware.cs:184`
**Category**: Convention

`catch (Microsoft.EntityFrameworkCore.DbUpdateException ex)` is the only fully-qualified type
in the file; everything else resolves through the usings at lines 1-3. Add
`using Microsoft.EntityFrameworkCore;`. (The layering question — API knowing an EF type — is a
settled decision at the tech-planning gate and is not a finding.)

### [N6] `tech-tasks.md` evidence note is one refactor stale

**File**: `docs/active/tasks/B-22-scoped-zone-item-keys/tech-tasks.md:~443`
**Category**: Documentation accuracy

The "Done." note records the shipped implementation as
`RuleFor(s => s.Zones).Must(zones => zones.Select(z => z.Id).Distinct().Count() == zones.Count)`,
but the code was subsequently extracted into the shared `HasNoDuplicateIds<T>` helper. The
semantics match, so this is drift rather than a false claim — but the point of inline evidence
notes is that they can be diffed against the code, so keep them current. Every other inline
note I spot-checked (the `DependentRules` note, the FR-1/FR-2 drive, the migration analysis)
matched the code.

## 🧭 Convention Violations (project rules)

- [ ] `src/Tidansu.Application/Spaces/Dtos/SpaceDtoValidator.cs:28,51` — `.Must()` on a
      reference/collection property without a preceding `.NotNull()` (see M2). This is the
      second occurrence in the repo and `.claude/context/backend-rules.md` was silent on it;
      I have appended a line to its Validation section.
- [ ] `src/Tidansu.API/Middlewares/ErrorHandlingMiddleware.cs:184` — fully-qualified type name
      instead of a `using` (N5).

No frontend files were touched, so the template-purity / token / static-Tailwind rules do not
apply to this diff. No Kiota regen needed — I confirmed no DTO shape and no route changed.

## 🏗️ Architecture Notes

**Things the dispatch asked me to check, which check out.** Recording these explicitly so the
next reader doesn't re-derive them:

- **`DependentRules` really does short-circuit.** Verified empirically against the shipped
  validator with a 501-zone payload whose every element was *also* individually invalid
  (empty `Id`, missing `Kind`/`Facing`): the result was `errorCount=1`, the cap message alone.
  `ZoneDtoValidator` never ran. Same for 5,001 items. The design intent holds.
- **No EF API depended on `Id` alone identifying a row.** Grepped the whole solution for
  `FindAsync` / `Find(` / `Attach` / `Entry(` / `Update(` — zero hits in Application and
  Infrastructure. Every zone/item access is `Set<T>().Add/Remove` plus space-rooted LINQ, so
  there is no key-based fixup, no `Find` by bare id, and nothing that silently changes shape
  under a composite key. `GetLayoutByIdAsync`'s entity projection is `AsNoTracking`, so no
  identity resolution is involved.
- **The migration's zero-row / cannot-fail claim is accurate.** `SpaceId` is already
  `nullable: false` in the base migration (`20260621142555_SpacesZonesItems.cs:42,71`), so
  `ADD PRIMARY KEY` needs no `AlterColumn` and EF correctly generated none. `(Id)` was the sole
  PK column, so `(SpaceId, Id)` is unique a fortiori and the ADD cannot hit a duplicate.
  `DROP`/`ADD PRIMARY KEY` are transactional DDL and there is no `suppressTransaction: true`,
  so the settled fail-loud posture holds. Dropping `IX_Zone_SpaceId` / `IX_Item_SpaceId` is
  correct — redundant with a `SpaceId`-leading clustered key — and no index now leads with
  `Id` alone, which is fine because no query filters on a bare `Id` (D-3 guarantees it).
  The FKs onto `Spaces.Id` are correctly untouched. The model snapshot matches.
- **Handler pre-check placement is right and the paywall is unregressed.** `AddZone`: 404 →
  `PlanPolicy.CheckAddZone` 403 → duplicate 400 → atomic insert. `AddItem`: 404 space → 404
  zone → `PlanPolicy.CheckAddItem` 403 → `SpacePhotoGuard` → duplicate 400 → atomic insert.
  The duplicate check sits strictly after both plan gates, so `zones`/`items`/`photos`
  `PlanLimitException` reasons fire exactly as before. The `sp_getapplock` resource still
  derives from `SpaceId` only, so B-12's one-resource-per-transaction property is intact.
- **Build is green** (`dotnet build src/Tidansu.API` → 0 errors).

**Tech debt this leaves behind.**

- **The new logic has no automated test.** `tests/` contains only `Tidansu.Domain.Tests`, which
  references `Tidansu.Domain` alone — so the validator rules and handler pre-checks ship with
  zero regression coverage, and all verification was manual/driven. Both M1 and M2 are exactly
  what a ten-line `SpaceDtoValidator` unit test would have caught; I found them by writing that
  test as a throwaway. A `Tidansu.Application.Tests` project is the highest-value follow-up
  this task surfaces.
- **In-space `uid()` collisions are now a user-visible 400 with no frontend handling.** The
  settled decision to leave `uid()` alone is sound for the cross-tenant problem — space-scoped
  ids make its predictability irrelevant across accounts. But within a single space it is still
  a counter that resets on page load plus 3 base36 digits of the ms epoch cycling ~47s
  (`src/Tidansu.App/src/data/spaces.ts:39-41`), so a user who reloads and adds a zone can
  genuinely collide with an existing zone in that same space. That now returns
  `400 {"zone.Id": [...]}`, which no frontend code handles (grep found no 400/duplicate handling
  in the spaces store or composables). Previously it was a 500 — equally unhandled, so this is
  not a regression and correctly out of scope here. Worth a backlog item: either a CSPRNG
  `uid()` or a retry-on-duplicate in the optimistic-add path.

**Scope creep**: none. The `src/` diff touches exactly the files `task.md`'s touch-points named,
minus `spaces.ts` (deliberately). The `.claude/agent-memory/**` changes are harness memory, not
product code.

## 👍 Positives

- The comment density on this diff is high but it is *load-bearing* — the `SpaceContentLockResource`
  and `RemoveZoneWithItemsAsync` tripwire comments were correctly **updated**, not left to rot,
  when the second such site went away. That is the hardest part of comment maintenance and it
  was done right.
- Choosing `DependentRules` over declaration order to sequence the cap ahead of `RuleForEach`
  is the correct instinct: it makes the ordering structural rather than an invariant that a
  future edit reorders away. And it demonstrably works.
- `SpaceCollectionCaps` living in Domain, separate from `PlanCaps`, with a comment explaining
  why it must not be folded in, is the right call — a request-size bound and a plan gate are
  different concepts with different HTTP outcomes (400 vs 403), and conflating them is exactly
  how a paywall regression gets introduced.
- The `RemoveItemAsync` refactor is a real improvement even though it was behaviour-neutral:
  a tenancy predicate that has to be derived from a subquery is fragile, and stating it
  directly costs nothing.
- The migration analysis in `tech-tasks.md` § 0 is genuinely rigorous — it resolved the brief's
  "highest-risk unknown" (the `Item`→`Zone` FK) by evidence rather than assumption, and the
  conclusion held up when I checked it independently.

## Action Checklist

- [ ] [M1] Make `HasNoDuplicateIds` compare with `StringComparer.OrdinalIgnoreCase` over
      `TrimEnd()`-normalised ids (or constrain `Id` to a collation-safe charset), so the
      in-memory check matches the CI collation the PK is enforced under.
- [ ] [M2] Add `.NotNull()` before each collection-cap `.Must(...)` in `SpaceDtoValidator`.
- [ ] [N1] Extract a shared `WriteGenericErrorAsync(context)` so the "byte-identical to the
      catch-all" invariant is structural rather than a comment.
- [ ] [N2] Correct `RemoveItemAsync`'s comment — the old query's scoping did not depend on
      global id uniqueness.
- [ ] [N3] Drop the "with the composite key" attribution from the duplicate-id rule comment.
- [ ] [N4] Fold the double allocation in `HasNoDuplicateIds` into the M1 fix.
- [ ] [N5] Add `using Microsoft.EntityFrameworkCore;` and drop the fully-qualified catch type.
- [ ] [N6] Refresh the `tech-tasks.md` duplicate-id "Done." note to describe the shipped helper.
- [ ] *(follow-up, not this task)* File a backlog item for a `Tidansu.Application.Tests`
      project, and one for in-space `uid()` collision handling in the optimistic-add path.
