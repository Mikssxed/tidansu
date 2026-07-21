<!--
Written by the tech-lead agent, then worked (and checked off) by the
feature-developer. Follows the tech-lead output format: ordered checkbox tasks
grouped by layer (Domain → Application → Infrastructure → API → Kiota → Frontend
→ Refactoring → Verification), plus Security / Scalability / New Dependencies /
Open Questions.
-->

# B-22 · Technical Tasks — Zone/Item keys scoped to their owning space

> Requirements: [`./requirements.md`](./requirements.md) (FR-1 … FR-7) · Brief: [`./task.md`](./task.md)
> Settled at kickoff and **not re-opened here**: composite key `(SpaceId, Id)`; client
> `uid()` stays clock-derived; oracle fix = key fix **+** explicit error mapping; cap =
> 500 zones / 5,000 items per request; synthetic rehearsal dataset; fail-loud rollback
> (no down-migration); no revert of B-15.

---

## 0. 🔎 Investigation findings (read before your first commit)

These were verified against the current code while writing this spec. They change the
shape of the work materially — **confirm each one yourself in the first task, then proceed.**

**F-1 — There is no `Item` → `Zone` foreign key. Nothing has to be re-pointed.**
The brief flagged this as "the part most likely to be got wrong." The answer is that the FK
does not exist. `src/Tidansu.Infrastructure/Migrations/20260621142555_SpacesZonesItems.cs`
declares exactly two FKs — `FK_Item_Spaces_SpaceId` (line 58) and `FK_Zone_Spaces_SpaceId`
(line 91) — both pointing at `Spaces.Id`, whose key is **unchanged** by this task.
`Item.ZoneId` is a bare `nvarchar(64)` column with no constraint;
`src/Tidansu.Domain/Entities/Item.cs:9-10` documents this as deliberate ("loose coupling,
mirrors the client") and the referential check lives in the application layer
(`AddItemCommandHandler.cs:33` → `ZoneExistsInSpaceAsync`). **Consequence:** no FK
re-pointing work exists, and you must **not** opportunistically add an
`Item(SpaceId, ZoneId) → Zone(SpaceId, Id)` FK in this slice — it would change delete
semantics and would fail on any pre-existing dangling `ZoneId`. See Open Question ❓1.

**F-2 — This is a key-definition migration, not a data migration. Zero rows change.**
No column is added, dropped, retyped or rewritten; only the `PRIMARY KEY` definition moves
from `(Id)` to `(SpaceId, Id)`. Critically, **the new key cannot collide on existing data**:
`(Id)` is already unique table-wide, so `(SpaceId, Id)` is unique *a fortiori*. The
`ADD CONSTRAINT … PRIMARY KEY` therefore cannot hit a duplicate-key error on any dataset.
This is the strongest safety property in the task — verify it, state it in the migration's
comment header, and do not build row-by-row copy/verify machinery that the settled fail-loud
posture explicitly rules out.

**F-3 — `Item.Photo` is still a plain `nvarchar(max)` column on `Item`; B-16 did not move it.**
The migrations directory ends at `20260712135515_StripeBillingFields` — B-15 and B-16 were
both schema-neutral. B-16 only *slimmed the read projections* (`GetLayoutByIdAsync`,
`GetSpaceSummariesPageAsync`, `GetItemCountsPerSpaceAsync` in `SpacesRepository.cs`) so the
photo column never leaves SQL. Photo-blob preservation is therefore whatever SQL Server's
clustered-index rebuild guarantees — which is total — not something a migration script has to
handle. Confirm via the model snapshot before trusting this.

**F-4 — EF can generate the whole thing; no raw SQL is needed for the key swap.**
`DROP CONSTRAINT PK_Zone` / `ADD CONSTRAINT PK_Zone PRIMARY KEY (SpaceId, Id)` are ordinary
DDL on SQL Server and both are transactional, so EF's default per-migration transaction
already gives the settled all-or-nothing/fail-loud posture for free. Do **not** reach for
`migrationBuilder.Sql(..., suppressTransaction: true)` — that is the one call that would
break it.

**F-5 — The repository's granular access is already space-scoped, so B-15/B-16 survive.**
Every lookup in `SpacesRepository.cs` is rooted at
`dbContext.Spaces.Where(s => s.Id == spaceId && s.UserId == userId)` and reaches zones/items
via `.SelectMany(s => s.Zones)` (D-3, documented at `SpacesRepository.cs:223-229`). There is
no overload that resolves a zone or item by bare id. The composite key makes that *structural*
rather than conventional — but it must still be verified query-by-query, not assumed.
Note that B-16 replaced `GetAllByUserAsync` outright; the live read path is
`GetSpaceSummariesPageAsync` + `GetLayoutByIdAsync` + `GetByIdWithoutContentAsync` +
`GetItemCountsPerSpaceAsync`.

**F-6 — The residual 500 after the key fix is a duplicate id *within the same space*.**
`AddZoneCommandHandler` and `AddItemCommandHandler` have no in-space duplicate-id pre-check,
and `SpaceDto.ToEntity` (`SpaceDto.cs:40-41`) materialises the whole zone/item graph, so a
single `POST /api/spaces` carrying two zones with the same id throws an EF **change-tracker
`InvalidOperationException`** (not even a `DbUpdateException`) before it reaches SQL. Both
paths surface as 500 today and would continue to after the key fix. This is not a cross-tenant
leak (it is entirely within the caller's own space), but FR-3's "never a raw 500" and FR-5's
"never a 500" both bite here — hence the validator and pre-check tasks below.

**F-7 — No DTO or route changes ⇒ no Kiota regen, no frontend work.**
`ZoneDto` / `ItemDto` / `SpaceDto` gain no field and lose none; the composite key never
crosses the wire (`ZoneDto` has no `SpaceId` — the space is already in the URL). Every
controller signature and route is untouched. See the Kiota section for the explicit ruling.

---

## 1. 📋 Technical Tasks

### Backend — Domain

*(No Domain change. `Zone.Id` / `Item.Id` / `Item.SpaceId` already exist as exactly the fields
the composite key is built from — the key is a persistence-mapping concern and the Domain
entities stay dependency-free. Listed explicitly so it reads as a decision, not an omission.)*

- [x] verify no Domain change is required — re-read `src/Tidansu.Domain/Entities/Zone.cs` and
      `src/Tidansu.Domain/Entities/Item.cs` and confirm `SpaceId` is already a non-nullable
      `string` on both (it is — `Zone.cs:6`, `Item.cs:6`). Do not add navigation properties, a
      `ZoneKey` value object, or `IEquatable` — nothing in the codebase compares zones by identity.

      **Confirmed (2026-07-21):** `Zone.cs:6` and `Item.cs:6` both declare
      `public string SpaceId { get; set; } = null!;` — non-nullable `string` on both. No
      navigation property, `ZoneKey` value object, or `IEquatable` added.

- [x] add `ZoneCollectionMax = 500` / `ItemCollectionMax = 5_000` constants in
      `src/Tidansu.Domain/Constants/` beside `PlanCaps.cs` / `PlanPolicy.cs`
      (pure constants, no outward dependency). One named home, not two magic numbers inline in
      a validator — the numbers are quoted in FR-5's rationale and will be re-read.
      ⚠️ These are **not** plan caps. Do not add them to `PlanCaps`, and do not let them resolve
      per-plan — FR-5 is a request-size bound applying identically to Free and Pro.

      **Done.** Added `src/Tidansu.Domain/Constants/SpaceCollectionCaps.cs` — a standalone
      `static class` (not folded into `PlanCaps`) with `ZoneCollectionMax = 500` and
      `ItemCollectionMax = 5_000`, no outward dependency.

### Backend — Infrastructure (the key swap — the heart of the task)

- [x] confirm the three migration preconditions before writing any code, and paste the evidence
      into your commit message
      - the only FKs on `Zone`/`Item` are `*_Spaces_SpaceId` → grep
        `src/Tidansu.Infrastructure/Migrations/` for `ForeignKey`, confirming F-1
      - `Zone`/`Item` are keyed on `Id` alone → `TidansuDbContextModelSnapshot.cs` lines ~281
        and ~327 (`b.HasKey("Id")` under the `Zone` / `Item` builders)
      - `Item.Photo` is still `nvarchar(max)` on `Item` → confirm F-3
      ⚠️ The whole plan rests on this task. If any of the three turns out false, stop and
      re-plan rather than adapting the later tasks in place.

      **Evidence (confirmed 2026-07-21):**
      - `20260621142555_SpacesZonesItems.cs` has exactly two `table.ForeignKey(...)` blocks
        touching `Zone`/`Item`: `FK_Item_Spaces_SpaceId` (lines 58-63) and `FK_Zone_Spaces_SpaceId`
        (lines 91-96), both `principalTable: "Spaces", principalColumn: "Id"`. `PK_Zone` (line 90)
        and `PK_Item` (line 57) are each `table.PrimaryKey(..., x => x.Id)` — single-column.
      - `TidansuDbContextModelSnapshot.cs` (pre-migration): `Item` block has `b.HasKey("Id")` at
        line 212; `Zone` block has `b.HasKey("Id")` at line 507 (line numbers shifted slightly from
        the plan's estimate due to intervening entities, same content).
      - `TidansuDbContextModelSnapshot.cs` line 190-191: `b.Property<string>("Photo").HasColumnType("nvarchar(max)")` on the `Item` block — confirmed unchanged.

- [x] add the composite key to `modelBuilder.Entity<Zone>` in
      `src/Tidansu.Infrastructure/Persistence/TidansuDbContext.cs`
      — `zone.HasKey(z => new { z.SpaceId, z.Id });` as the **first** line of the existing
      `Entity<Zone>` block (`TidansuDbContext.cs:85-92`).
      Column order is `(SpaceId, Id)` deliberately, not `(Id, SpaceId)`: SpaceId-leading means
      the clustered key co-locates one space's zones on the same pages (every read path filters
      by space first) and subsumes the existing `IX_Zone_SpaceId`.
      ⚠️ `SpaceId` must stay non-nullable — a PK column cannot be nullable. It already is; do
      not "tidy" it to `string?`.

- [x] add the composite key to `modelBuilder.Entity<Item>` in the same file
      — `item.HasKey(i => new { i.SpaceId, i.Id });` as the first line of the existing
      `Entity<Item>` block (`TidansuDbContext.cs:94-105`). Same ordering rationale.
      ⚠️ Do **not** touch `item.Property(i => i.ZoneId)` — `ZoneId` is not part of the key and
      gains no constraint (F-1).
      ⚠️ Leave `space.HasMany(s => s.Zones).WithOne().HasForeignKey(z => z.SpaceId)`
      (`TidansuDbContext.cs:74-82`) exactly as-is. EF handles an FK column that is also the
      dependent's leading PK column; rewriting it to `WithOne(z => z.Space)` would require a
      navigation property that deliberately does not exist.

- [x] generate the migration —
      `dotnet ef migrations add ScopeZoneItemKeysToSpace --project src/Tidansu.Infrastructure --startup-project src/Tidansu.API`
      🔒 blocked by: both `HasKey` tasks
      ⚠️ Mandatory per the EF-migration rule — a `TidansuDbContext` model change never ships
      without one.

- [x] hand-audit the generated
      `src/Tidansu.Infrastructure/Migrations/<stamp>_ScopeZoneItemKeysToSpace.cs`
      🔒 blocked by: migration generation
      Expect, per table: `DropPrimaryKey` → (possibly `DropIndex IX_Zone_SpaceId` /
      `IX_Item_SpaceId`, now redundant as the PK's leading column) → `AddPrimaryKey` with
      `columns: new[] { "SpaceId", "Id" }`. Check specifically that:
      - **no `DropColumn` / `AddColumn` / `AlterColumn` on `Photo`, `Tags` or `ColumnLabels`
        appears.** Any of those means EF thinks the model changed more than you intended — stop
        and diff the snapshot.
      - if EF emits `DropForeignKey`/`AddForeignKey` for `FK_*_Spaces_SpaceId` around the swap,
        that is expected and harmless — but confirm each is re-added with the **same principal
        column `Spaces.Id` and the same `onDelete: ReferentialAction.Cascade`**. A cascade
        silently downgraded to `NoAction` would leave orphan zones/items on space delete. 🟠
      - **no `suppressTransaction: true` anywhere** (F-4 — this is what guarantees the settled
        all-or-nothing posture).
      - the generated `Down` may stay as EF wrote it; per the settled fail-loud posture it is
        not a supported recovery path. Add a comment saying so rather than deleting it.

- [x] add an explanatory comment header to the generated migration recording **why it cannot
      fail on existing data** — `(Id)` was already unique table-wide, so `(SpaceId, Id)` is
      unique by construction and `ADD PRIMARY KEY` cannot hit a duplicate-key error on any
      dataset (F-2); and that zero row values are read or written. Mirror the comment density of
      `SpacesRepository.cs` — this is the file a future on-call engineer opens first.

- [x] decide and record the fate of `IX_Zone_SpaceId` / `IX_Item_SpaceId`
      🔒 blocked by: migration audit
      If EF dropped them, that is correct (redundant against a SpaceId-leading PK) — note it in
      the migration comment. If EF kept them, drop them explicitly: two identical access-path
      structures is pure write amplification on every zone/item insert.

      **Decision:** EF dropped both automatically (`DropIndex` calls in the generated migration,
      confirmed also absent from `sys.indexes` on the local dev DB post-migration — only `PK_Item`
      / `PK_Zone` remain). No explicit drop needed; noted in the migration's comment header.

- [x] verify `src/Tidansu.Infrastructure/Migrations/TidansuDbContextModelSnapshot.cs` now shows
      `b.HasKey("SpaceId", "Id")` for both `Zone` and `Item`
      🔒 blocked by: migration generation
      ⚠️ A snapshot that disagrees with the migration is how the *next* migration silently
      re-generates this one.

      **Confirmed:** `b.HasKey("SpaceId", "Id")` appears at line 211 (`Item`) and line 503
      (`Zone`), and the redundant `b.HasIndex("SpaceId")` that used to follow each `HasKey` in
      those blocks is gone.

- [x] audit every query in `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs` against
      the new key — read each of `GetByIdAsync`, `GetLayoutByIdAsync`,
      `GetByIdWithoutContentAsync`, `GetItemCountsPerSpaceAsync`, `GetSpaceSummariesPageAsync`,
      `GetZoneAsync`, `GetItemAsync`, `ZoneExistsInSpaceAsync`, `AddZoneAsync`, `AddItemAsync`,
      `AddZoneWithinCapAsync`, `AddItemWithinCapAsync`, `RemoveZoneWithItemsAsync`,
      `RemoveItemAsync` and confirm none resolves a zone/item by bare id (F-5). Expect **no code
      change** — the deliverable is the confirmation, or a defect if you find one.
      ⚠️ Pay particular attention to `RemoveItemAsync` (`SpacesRepository.cs:418-425`): its
      `WHERE` is `i.Id == itemId AND EXISTS(spaces where s.Id == spaceId && s.Id == i.SpaceId &&
      s.UserId == userId)`. The space correlation is present but *indirect* (via
      `s.Id == i.SpaceId`) rather than a direct `i.SpaceId == spaceId`. It is correct as
      written — but once ids are only space-unique, this is the one query where a future
      simplification that drops the correlation would delete another tenant's item. See the
      refactor task. 🔴
      ⚠️ `GetLayoutByIdAsync` projects into `new Zone {…}` / `new Item {…}` under
      `AsNoTracking()`; projections into entity types are unaffected by key shape, but re-run the
      space-detail read after migrating to be sure EF still composes it.

      **Evidence (confirmed 2026-07-21) — query by query, none resolves by bare id:**
      - `GetByIdAsync` — space rooted at `s.Id == id && s.UserId == userId`; `.Include(Zones)`/
        `.Include(Items)` are EF-generated FK joins on `SpaceId`, not a bare-id lookup. Safe.
      - `GetItemCountsPerSpaceAsync` / `GetSpaceSummariesPageAsync` — `s.Zones.Count`/
        `s.Items.Count`/`s.Zones...Select(z => z.Color)` are navigation-correlated per owned
        space; no `Id`-only predicate anywhere. Safe.
      - `GetLayoutByIdAsync` — owner-scoped root, then `s.Zones.Select(z => new Zone{…})` /
        `s.Items.Select(i => new Item{…})`; entity-shaped projection but still driven off the
        `s.Zones`/`s.Items` navigation of the one owner-scoped space, not a bare-id filter. Safe.
      - `GetByIdWithoutContentAsync`, `CountZonesAsync`, `CountItemsAsync` — space-only or
        navigation `.Count`, same shape as above. Safe.
      - `GetZoneAsync` / `GetItemAsync` / `ZoneExistsInSpaceAsync` (and the new
        `ItemExistsInSpaceAsync`) — `Where(s => s.Id == spaceId && s.UserId == userId)
        .SelectMany(s => s.Zones/Items).First/Any(x => x.Id == zoneId/itemId)`. The
        `x.Id == …` predicate only ever runs against the already owner-scoped `SelectMany`
        set — not a bare-id filter over the whole table. Safe.
      - `AddZoneAsync` / `AddItemAsync` — ownership checked via `AnyAsync(s.Id == entity.SpaceId
        && s.UserId == userId)` before `Set<Zone/Item>().Add(...)`; an insert, not a keyed
        lookup. Safe.
      - `AddZoneWithinCapAsync` / `AddItemWithinCapAsync` — re-count via the already-audited
        `CountZonesAsync`/`CountItemsAsync`; insert only. Safe.
      - `RemoveZoneWithItemsAsync` — resolves `zone` via the already-audited (owner-scoped)
        `GetZoneAsync`, then deletes items with **`i.SpaceId == zone.SpaceId && i.ZoneId ==
        zoneId`** — a direct, explicit `SpaceId` correlation (not even the indirect pattern).
        `Set<Zone>().Remove(zone)` deletes by the zone's own composite key, already
        owner-verified via the resolve step. Safe.
      - `RemoveItemAsync` (`SpacesRepository.cs:418-425`, now +2 lines from the
        `ItemExistsInSpaceAsync` addition below it) — **confirmed correct-but-indirect exactly as
        flagged**: `WHERE i.Id == itemId AND EXISTS(SELECT 1 FROM Spaces s WHERE s.Id == spaceId
        AND s.Id == i.SpaceId AND s.UserId == userId)`. The `s.Id == i.SpaceId` conjunct inside
        the EXISTS transitively forces `i.SpaceId == spaceId` (since `s.Id == spaceId` is also
        required), so the correlation is present and correct today — just not written as a
        direct `i.SpaceId == spaceId` predicate. **No defect found; explicit-correlation fix is
        deliberately deferred to the refactor task per this dispatch's scope**, not applied here.
      - `GetLayoutByIdAsync`'s entity-shaped projection under `AsNoTracking()` re-confirmed to
        still compose against the composite-keyed model: `dotnet build` is green (below) and the
        LINQ shape (`s.Zones.Select(z => new Zone{ Id = z.Id, SpaceId = z.SpaceId, ... })`) never
        references `Zone`'s/`Item`'s key definition directly — it assigns `Id`/`SpaceId` as plain
        scalar properties, which EF projects regardless of what the entity's `HasKey` is. No
        change needed; a full data-driven re-run of this read path is left to the Verification
        dispatch (seeded dataset not yet built in this dispatch).
      - **Conclusion: zero defects found.** Every query is already owner/space-scoped, either
        directly or (in `RemoveItemAsync`'s one case) transitively through an EXISTS. No code
        change made here, per the task's own expectation.

- [x] confirm the `sp_getapplock` pattern is unaffected — re-read `AcquireLockOrThrowAsync`,
      `SpaceContentLockResource` and both `Add*WithinCapAsync` methods
      (`SpacesRepository.cs:136-350`). The lock resource derives from `SpaceId`/`UserId` only,
      and the in-lock re-count goes through `CountZonesAsync`/`CountItemsAsync` (owner-scoped
      `COUNT(*)` projections), so nothing in B-12/B-15's atomic-cap machinery reads a zone/item
      key. Expect **no change**; the deliverable is the confirmation.

      **Evidence (confirmed 2026-07-21):**
      - `AddWithinSpaceCapAsync`'s lock resource is `$"tidansu:space-create:{HashForLock(space.UserId)}"`
        — hashes `space.UserId` only, no zone/item id ever enters it.
      - `SpaceContentLockResource(spaceId)` (the single shared builder for both
        `AddZoneWithinCapAsync` and `AddItemWithinCapAsync`, per D-4) is
        `$"tidansu:space-content:{HashForLock(spaceId)}"` — hashes `spaceId` only.
      - `AcquireLockOrThrowAsync` takes the pre-built `resource` string and a free-text `context`
        label for logging; it does not itself touch `SpaceId`/`Id` at all — it only runs
        `sp_getapplock` against whatever resource string it is handed.
      - The in-lock authoritative re-count in both `Add*WithinCapAsync` methods calls
        `CountZonesAsync`/`CountItemsAsync`, already audited above as navigation `.Count`
        projections with no zone/item key predicate.
      - **Conclusion: confirmed unaffected.** The composite key changes nothing about lock
        acquisition, resource derivation, or the in-lock re-count; no code change made.

- [x] add `ItemExistsInSpaceAsync(spaceId, itemId, userId, ct)` to
      `src/Tidansu.Domain/Repositories/ISpacesRepository.cs` — mirror `ZoneExistsInSpaceAsync`'s
      signature exactly. Interface stays in Domain, no EF types.

- [x] implement `ItemExistsInSpaceAsync` in `SpacesRepository.cs`
      🔒 blocked by: the interface task
      — copy `ZoneExistsInSpaceAsync` (`SpacesRepository.cs:272-276`) verbatim with `s.Items` /
      `i.Id`. It preserves the D-3 property: owner-scoped root, no bare-id overload. No
      `ServiceCollectionExtensions` change needed — `SpacesRepository` is already registered.

      **Done.** Added directly below `ZoneExistsInSpaceAsync` in both the interface
      (`ISpacesRepository.cs`) and the implementation (`SpacesRepository.cs`), same
      `Where(s => s.Id == spaceId && s.UserId == userId).SelectMany(s => s.Items).AnyAsync(i =>
      i.Id == itemId, ...)` shape. `dotnet build` from `src/Tidansu.API`: **succeeded, 0 errors**
      (8 pre-existing `NU1903` NuGet-audit warnings on `System.Security.Cryptography.Xml`,
      unrelated to this change and unchanged in count).

### Backend — Application (defence-in-depth cap + duplicate-id closure)

- [x] add collection-length rules to `src/Tidansu.Application/Spaces/Dtos/SpaceDtoValidator.cs`
      🔒 blocked by: the constants task
      — `RuleFor(s => s.Zones).Must(z => z.Count <= ZoneCollectionMax)` and the `Items`
      equivalent, each with a message naming the collection and the limit (FR-5 requires the
      error to identify *which* collection). Mirror the existing
      `RuleForEach(...).SetValidator(...)` style already in that file.
      ⚠️ Place these **before** the `RuleForEach` lines, and make the ordering structural — use
      `.DependentRules(() => { RuleForEach... })` or `CascadeMode.Stop` rather than relying on
      line order. Otherwise FluentValidation runs the per-element validator across all ~120,000
      zones of an attack payload before rejecting the collection: the cap must short-circuit the
      expensive work, not follow it. 🟠
      ⚠️ Validation runs *before* handlers, so this 400 preempts the plan-gate 403 for any
      request over 500 zones. That is correct and harmless (no legitimate Free user reaches 500)
      but it is the known "validation preempts the paywall" trap — confirm it in the FR-6 drive,
      don't assume.

      **Done.** `RuleFor(s => s.Zones).Must(zones => zones.Count <= SpaceCollectionCaps.ZoneCollectionMax)`
      and the `Items` equivalent, each with a message naming the collection and the limit, using
      `.DependentRules(() => { RuleForEach...; RuleFor(duplicate-id) })` so the cap structurally
      short-circuits both the per-element validator and the duplicate-id check below it — not
      relying on declaration order. The FR-6 "validation preempts the paywall" interaction is left
      for the Verification dispatch's FR-6 drive, per this dispatch's scope.

- [x] add an intra-request duplicate-id rule for `Zones` in `SpaceDtoValidator.cs`
      🔒 blocked by: the collection-cap rules
      — reject a `Zones` collection containing two entries with the same `Id`, with a clean
      validation message. Rationale (F-6): with `(SpaceId, Id)` as the key, a single
      `POST /api/spaces` carrying duplicate zone ids throws an EF change-tracker
      `InvalidOperationException` inside `SpaceDto.ToEntity`'s graph → 500. FR-3/FR-5 both
      require a clean 400 instead.

      **Done.** `RuleFor(s => s.Zones).Must(zones => HasNoDuplicateIds(zones, z => z.Id))`
      nested inside the cap rule's `DependentRules`, so it never runs on an oversized payload.

      **⚠️ CORRECTED at the review gate.** This entry originally claimed a plain ordinal
      `Distinct()` closed the gap. It did not, and the review (M1) proved it: the key this rule
      guards is enforced by SQL Server under `SQL_Latin1_General_CP1_CI_AS` — case-**in**sensitive
      and trailing-whitespace-insensitive — so `z1`/`Z1` and `z1`/`z1 ` passed validation, passed
      EF's equally-ordinal change tracker, and died at `SaveChangesAsync` as a PRIMARY KEY
      violation → the exact 500 FR-3/FR-5 forbid. `HasNoDuplicateIds` now normalises with
      `TrimEnd()` + `StringComparer.OrdinalIgnoreCase` to match the database's semantics
      (verified: both previously-passing pairs now rejected, genuinely-distinct ids unaffected).
      Only this in-memory `CreateSpace` graph path was exposed — the granular `AddZone`/`AddItem`
      pre-checks evaluate in SQL and already inherit the CI collation.

- [x] add the same intra-request duplicate-id rule for `Items` in `SpaceDtoValidator.cs`
      🔒 blocked by: the zone duplicate rule (extract a shared private helper rather than
      copy-pasting the LINQ — one place to fix means one place to get wrong)

      **Done, written plainly (not extracted).** Same LINQ shape as the Zones rule, over
      `i.Id`. Per this dispatch's explicit instruction, the `[refactor]` task below that extracts
      the shared duplicate-id LINQ into one private helper is deliberately **not** applied here —
      left for the Refactoring dispatch.

- [x] add an in-space duplicate-zone-id pre-check to
      `src/Tidansu.Application/Spaces/Commands/AddZone/AddZoneCommandHandler.cs`
      — call the existing `spaces.ZoneExistsInSpaceAsync(request.SpaceId, request.Zone.Id, userId, ct)`
      and reject a duplicate before the insert.
      ⚠️ **Ordering is load-bearing.** It must go *after* the owner-scope
      `CountZonesAsync ?? throw NotFoundException` (lines 26-27) and *after* the
      `PlanPolicy.CheckAddZone` gate (line 32) — an unknown/other-user space must still 404
      before anything, and a Free user at cap must still get `403 {plan:["zones"]}` rather than
      this new error. Put it immediately before `request.Zone.ToEntity(...)`.
      ⚠️ `ZoneExistsInSpaceAsync` is owner-scoped, so this check can only ever observe the
      caller's own space — it introduces no new existence oracle. Do **not** implement it with
      an unscoped `AnyAsync(z => z.Id == …)`; that would re-create the exact FR-3 leak this task
      is closing. 🔴
      ⚠️ It is a pre-check, not enforcement: a concurrent duplicate can still slip past into the
      DB constraint. That is what the middleware backstop is for — do **not** try to close it by
      widening `sp_getapplock` (see C-5).

      **Done.** Inserted immediately before `request.Zone.ToEntity(...)`, after
      `CountZonesAsync ?? throw NotFoundException` and after `PlanPolicy.CheckAddZone`. Calls the
      existing owner-scoped `ZoneExistsInSpaceAsync` and throws
      `ValidationException({"Zone.Id": ["A zone with this id already exists in this space."]})`
      on a hit — same `ValidationException` type `ValidationBehavior`/`SpacePhotoGuard` already
      use, so it maps to a clean 400 via the existing pipeline, no middleware change needed.

- [x] add the in-space duplicate-item-id pre-check to
      `src/Tidansu.Application/Spaces/Commands/AddItem/AddItemCommandHandler.cs`
      🔒 blocked by: `ItemExistsInSpaceAsync` implementation
      ⚠️ Same ordering constraint as the zone version, plus one more: it must go **after** the
      `PlanPolicy.CheckAddItem` photo/item gate (line 42) and **after** `SpacePhotoGuard` (line
      47), so a Free user attaching a photo still gets `403 {plan:["photos"]}` first. Place it
      immediately before `dto.ToEntity(request.SpaceId)`.

      **Done.** Inserted immediately before `dto.ToEntity(request.SpaceId)`, after
      `PlanPolicy.CheckAddItem` and after `SpacePhotoGuard.ThrowIfInvalid`. Calls the owner-scoped
      `ItemExistsInSpaceAsync` and throws the `Item.Id`-keyed `ValidationException` equivalent on
      a hit.

### Backend — API (oracle closure)

- [x] add an explicit `DbUpdateException` catch clause to
      `src/Tidansu.API/Middlewares/ErrorHandlingMiddleware.cs`
      — insert **immediately before** the final `catch (Exception ex)` block (currently line
      184), mirroring the shape of the existing
      `catch (Microsoft.AspNetCore.Http.BadHttpRequestException ex)` clause (line 141): log the
      full exception server-side at `LogError`, return `500` with the existing generic
      `ApiOperationResult` body (`GeneralErrorKey` → `"Something went wrong."`).
      ⚠️ The response body must be **byte-identical** to the generic 500 the final catch already
      produces. The entire point of FR-3 is that a caller cannot distinguish a persistence
      collision from any other failure — a distinct message, a distinct status code, or a
      constraint name echoed into the body all re-open the oracle. Do not "improve" this into a
      409 Conflict. 🔴
      ⚠️ Never let `ex.Message` or `ex.InnerException.Message` reach the response — a SQL Server
      duplicate-key error message contains the **colliding key value**, i.e. another tenant's
      zone id verbatim. Server-side log only. 🔴
      ⚠️ Layering: this catches `Microsoft.EntityFrameworkCore.DbUpdateException` in the API
      project. That is consistent with the existing precedent in this same file (it already
      catches the framework type `BadHttpRequestException`), and `Tidansu.API` already
      references `Tidansu.Infrastructure` (`Tidansu.API.csproj:23`). Do **not** add a new
      package reference to make it compile — if it doesn't compile as-is, that is a signal to
      reconsider the seam, not to add EF to the API's `.csproj`. See Open Question ❓2.

      **Done.** New `catch (Microsoft.EntityFrameworkCore.DbUpdateException ex)` inserted
      immediately before the final `catch (Exception ex)` in `ErrorHandlingMiddleware.cs`,
      fully-qualified (no new `using`, mirrors how `BadHttpRequestException` is referenced
      fully-qualified in the same file). Logs `logger.LogError(ex, "Persistence failure:
      {Message}", ex.Message)` server-side, then writes **exactly** the same
      `StatusCodes.Status500InternalServerError` + `ApiOperationResult { IsSuccess = false,
      Errors = { GeneralErrorKey: ["Something went wrong."] } }` body as the existing catch-all —
      copied verbatim, not paraphrased, so the two are byte-identical by construction. Compiled
      without touching `Tidansu.API.csproj` — `Tidansu.EntityFrameworkCore.DbUpdateException`
      resolved via the existing `Tidansu.Infrastructure` project reference, confirming the F-7/❓2
      layering call needed no new package. `dotnet build` from repo root: **succeeded, 0 errors**,
      same 8 pre-existing `NU1903` warnings, unchanged count.

- [x] confirm the EF change-tracker duplicate-key `InvalidOperationException` is unreachable
      🔒 blocked by: the `SpaceDtoValidator` duplicate-id rules
      Prefer "unreachable" over a new catch clause: a request-shape problem belongs in request
      validation, not exception mapping, and `InvalidOperationException` is far too broad to
      catch safely. Verify by driving the case. If a path remains, it falls into the existing
      generic `catch (Exception)` and already returns the identical generic 500 — record that as
      acceptable.

      **Confirmed unreachable, by code-path tracing** (a live drive of this exact case is left to
      the Verification dispatch's synthetic dataset, per this dispatch's scope):
      - `grep -n "ToEntity" src/Tidansu.Application/Spaces` shows the **only** place that
        materialises a whole zone/item graph in one change-tracker operation is
        `SpaceDto.ToEntity` (`SpaceDto.cs:40-41`, `Zones = [.. Zones.Select(z => z.ToEntity(Id))]`
        / same for `Items`), called from exactly one handler: `CreateSpaceCommandHandler.cs:42`.
        `AddZoneCommandHandler`/`AddItemCommandHandler` call `ZoneDto.ToEntity`/`ItemDto.ToEntity`
        for a **single** entity per request — a duplicate-within-request is not even expressible
        there (cross-space duplicates there are closed by the separate
        `ZoneExistsInSpaceAsync`/`ItemExistsInSpaceAsync` pre-checks, already implemented).
      - `CreateSpaceCommandValidator.cs:10` — `RuleFor(c => c.Space).NotNull().SetValidator(new
        SpaceDtoValidator())` — so every `CreateSpaceCommand` is validated by `SpaceDtoValidator`,
        including the new duplicate-id `DependentRules`.
      - `ValidationBehavior.cs:10-36` — a MediatR `IPipelineBehavior` that runs `ValidateAsync`
        and, on any failure, `throw new ValidationException(...)` **before** calling
        `next(cancellationToken)`. The handler (and therefore `ToEntity`) never executes when
        validation fails.
      - **Conclusion:** a `CreateSpaceCommand` carrying two zones (or two items) with the same id
        is now rejected by `SpaceDtoValidator`'s duplicate-id rule inside the MediatR pipeline,
        before `CreateSpaceCommandHandler.Handle` runs — so `SpaceDto.ToEntity`'s change-tracker
        graph build, the only place the `InvalidOperationException` could originate, is never
        reached with duplicate ids. The path is unreachable, not merely caught. No new middleware
        clause added for it, per the plan's stated preference.

- [x] confirm no controller signature, route, or `ProducesResponseType` changes — read
      `src/Tidansu.API/Controllers/SpaceZonesController.cs`, `SpaceItemsController.cs` and
      `SpacesController.cs` and verify none needs editing (F-7). The
      `[RequestSizeLimit(64 * 1024)]` on the granular zone/item routes is complementary to
      FR-5's collection cap, not redundant with it — leave both.

      **Confirmed.** Re-read all three controllers in full. No method signature, route attribute,
      HTTP verb, or `[ProducesResponseType]` differs from before this dispatch. The new
      `DbUpdateException` clause returns a `500`, matching the pattern already established for
      `EmailDeliveryException`/`BillingUnavailableException` in the same middleware — neither of
      those gained a `[ProducesResponseType(500)]` on any controller either (a bare 500 from an
      unexpected failure is implicit, not documented per-action in this codebase), so no
      controller edit was warranted here either. `[RequestSizeLimit(64 * 1024)]` on
      `SpaceZonesController`/`SpaceItemsController`'s `AddZone`/`AddItem` (Kestrel body-size, a
      transport concern) and the new `SpaceCollectionCaps` (a validated collection-length count,
      an application concern) are unrelated axes — left both untouched, as instructed.

### Kiota / contract

- [x] **No Kiota regeneration required — record this as a deliberate finding, not an omission.**
      No DTO gains or loses a field; no route, verb or response type changes (F-7).
      `src/Tidansu.App/src/api/apiClient/` is untouched.
      ⚠️ If your implementation *does* end up changing a DTO — a new error shape, a new field —
      a regen becomes mandatory **and** you hit B-21: `npm run build:api` is currently broken.
      The documented workaround is to boot the API (`dotnet run` from `src/Tidansu.API`) and
      curl `/swagger/v1/swagger.json` to feed Kiota manually. Do not fix B-21 here, and never
      hand-edit `src/api/apiClient/`.

      **Recorded as a deliberate no-op finding.** This dispatch's entire change set —
      `ErrorHandlingMiddleware.cs`, `SpaceDtoValidator.cs`, `SpacesRepository.cs` comments/query —
      touches zero DTOs, zero routes, zero response shapes. `src/Tidansu.App/src/api/apiClient/`
      was not opened, let alone edited. No Kiota regen performed; none required.

### Frontend

- [x] **No frontend change required.** Per the settled decision, `uid()` in
      `src/Tidansu.App/src/data/spaces.ts:39-41` stays clock-derived — once ids are space-scoped
      its predictability is no longer a cross-tenant issue. No store, composable, component or
      view treats a zone/item id as globally unique (the client already keys zones/items within
      a loaded space). Confirm with a grep before closing, then prove it by driving the app,
      not by reasoning.

      **Recorded as a deliberate no-op finding.** `grep -rn "uid(" src/Tidansu.App/src` shows
      `uid()` used only to mint a new zone/item's own id at creation time and to key it in the
      local store/component tree (Vue `:key`) — never compared across spaces or used to assert
      global uniqueness anywhere in the frontend. `src/Tidansu.App/src/data/spaces.ts:39-41` left
      byte-for-byte unchanged, per the settled kickoff decision. No frontend file touched this
      dispatch; a full driven confirmation (creating colliding zones as two users and watching
      both succeed) is left to the Verification dispatch, per this dispatch's scope.

### Refactoring

- [x] `[refactor]` make the space correlation in `RemoveItemAsync` explicit
      (`src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs:418-425`) — add
      `i.SpaceId == spaceId` to the `WHERE` predicate. Scoped to a touched file; it converts an
      inferred safety property into a stated one at precisely the moment ids stop being globally
      unique. 🔴

      **Done.** `RemoveItemAsync`'s `Where` now reads
      `i.SpaceId == spaceId && i.Id == itemId && dbContext.Spaces.Any(s => s.Id == spaceId &&
      s.UserId == userId)` — the space correlation that used to be only transitive (via
      `s.Id == i.SpaceId` inside the EXISTS) is now a direct predicate, alongside the ownership
      EXISTS (kept, since it's still what confirms `spaceId` belongs to `userId`). Behaviour is
      unchanged: the set of rows the DELETE can affect is identical (the old predicate already
      implied `i.SpaceId == spaceId` transitively; F-2/F-5's audit already established this), so
      nothing that deleted before still deletes now, and nothing new is deleted. Also updated the
      cross-reference in `RemoveZoneWithItemsAsync`'s adjacent comment (lines ~399-405), which
      used to describe `RemoveItemAsync` as "carrying ownership as an EXISTS subquery" only — now
      states that `RemoveItemAsync` states its own `spaceId` directly, so the two comments stay
      mutually consistent.

- [x] `[refactor]` extract the duplicate-id LINQ shared by the `Zones` and `Items` rules in
      `SpaceDtoValidator.cs` into one private static helper (DRY — two copies of a uniqueness
      check is two places for a future edit to diverge).

      **Done.** Added `private static bool HasNoDuplicateIds<T>(IEnumerable<T> entries, Func<T,
      string> idSelector)` at the bottom of `SpaceDtoValidator`; both the `Zones` and `Items`
      duplicate-id rules now call `HasNoDuplicateIds(zones, z => z.Id)` /
      `HasNoDuplicateIds(items, i => i.Id)` instead of each inlining its own
      `.Select(...).Distinct().Count() == ...Count` LINQ. Same uniqueness semantics as before
      (verified by re-reading — a single `.ToList()` materialisation then `Distinct().Count() ==
      ids.Count`, identical to the two prior inline expressions).

- [x] `[refactor]` update the D-3 comment block at `SpacesRepository.cs:223-229` to state that
      space-scoping is now enforced by the **primary key**, not only by query construction. That
      comment is the tripwire a future maintainer reads; it is currently one version behind
      reality.

      **Done.** Appended a B-22 paragraph to the D-3 comment block (now
      `SpacesRepository.cs:223-238`) explaining that since the `(SpaceId, Id)` composite key
      replaced the old `Id`-alone key, this owner-scoping is load-bearing rather than incidental:
      before, a bare `Id` was unique table-wide so even an under-scoped predicate could only ever
      match one row; now the same `Id` can legitimately exist in many spaces, so an under-scoped
      lookup could cross tenants. Points at `RemoveItemAsync`'s now-explicit `i.SpaceId ==
      spaceId` as the concrete instance of the principle. Original D-3 text (the "rooted at
      `s.Id == spaceId && s.UserId == userId`" claim) left intact — it is still true — the new
      paragraph only adds *why it now matters more*.

- [x] No other refactoring needed in touched files. `TidansuDbContext.cs`,
      `ErrorHandlingMiddleware.cs` and both add-handlers are already in good shape and their
      layer discipline is intact — resist widening scope into them.

      **Confirmed.** Re-read `TidansuDbContext.cs`, `AddZoneCommandHandler.cs`,
      `AddItemCommandHandler.cs`, and the whole of `ErrorHandlingMiddleware.cs` and
      `SpaceDtoValidator.cs` after this dispatch's edits. No further refactor found: the
      middleware's new clause matches the existing per-exception-type catch shape exactly; the
      validator's cap/duplicate rules already share the extracted helper; `SpacesRepository.cs`'s
      only two behaviour-preserving comment/query edits (`RemoveItemAsync`,
      `RemoveZoneWithItemsAsync`'s cross-reference, the D-3 block) are the ones named above.
      Scope not widened beyond the files this dispatch's tasks named.

### Verification

- [x] `dotnet build` from `src/Tidansu.API` — green.

      **Confirmed (2026-07-21, verification dispatch).** `dotnet build` from repo root: 0 errors,
      8 pre-existing `NU1903` warnings (System.Security.Cryptography.Xml), unchanged count.

- [x] `dotnet test tests/Tidansu.Domain.Tests` — green.
      ⚠️ No new Domain unit test is warranted: the composite key is a persistence mapping, not a
      pure Domain rule, and there is no new `PlanPolicy`/`PhotoPolicy` behaviour. A table test
      asserting the two FR-5 constants is optional and low-value — the real gate is the driven 400.

      **Confirmed.** 62/62 tests passed, 0 failed, 0 skipped.

- [x] `npm run build` from `src/Tidansu.App` (vue-tsc type-check) — green. Expected unaffected;
      run it to prove F-7.

      **Confirmed.** `vue-tsc -b && vite build` completed clean — no type errors, build emitted
      to `../Tidansu.API/wwwroot/`. Corroborates F-7 (no DTO/route change ⇒ nothing for Kiota to
      regenerate, nothing for the frontend to react to).

- [x] **Build the synthetic rehearsal dataset** — a throwaway seeding script (scratchpad or a
      dev-only `--seed` switch; do not ship it) producing, on a **pre-migration** database:
      1. a **Free space at/under cap** — 6 zones, 50 items, no photos;
      2. a **Free space over cap, read-only after downgrade** — e.g. 9 zones / 80 items owned by
         a user whose `Plan` is `Free` (seed as Pro, then downgrade), exercising FR-4's
         "read-only status must be preserved, not reset";
      3. a **Pro space with photo blobs** — several items carrying real data-URL `Photo` values,
         at least one > 1 MB so the clustered-index rebuild actually moves LOB data;
      4. **two spaces deliberately sharing zone and item ids** — the FR-1 fixture and the reason
         the task exists. Include both the *same-user, two-spaces* case and the *two-different-
         users* case.
      ⚠️ Record the exact per-space zone count, item count, and a checksum/length of each `Photo`
      **before** migrating. FR-4's acceptance criterion is a before/after comparison; without the
      "before" it is unfalsifiable.
      ⚠️ Per the settled decision this is **synthetic**, not a production snapshot — say so in
      the verification write-up. Do not claim prod-shaped coverage.

      **Done, on a throwaway database (`TidansuDb_B22_Rehearsal`), not the dev DB.** Created a
      fresh LocalDB database, migrated it to `StripeBillingFields` (pre-B-22 schema, `Id`-alone
      PK), then seeded via a scratchpad Python-generated SQL script:
      - `sp-free-atcap` — 6 zones / 50 items, no photos, owner `Free`.
      - `sp-free-overcap` — 9 zones / 80 items, owner `Free` (representing post-downgrade
        over-cap content).
      - `sp-pro-photos` — 3 zones / 3 items, owner `Pro`, `Photo` = real base64 data URLs of
        1,500 / 40,000 / 900,000 raw random bytes (the last one 1,200,022 base64 chars —
        > 1 MB text — to make the LOB-rebuild timing meaningful).
      **Note on item 4 (two spaces sharing ids) — a structural gap in this checklist item, found
      and reported rather than silently worked around:** duplicate zone/item ids **cannot be
      seeded on a pre-migration database** — pre-migration, `(Id)` alone is the PK, so two rows
      sharing an `Id` anywhere in the `Zone`/`Item` tables would violate that PK at insert time.
      The FR-1 collision fixture is therefore only expressible **after** migrating (which is
      exactly what the "Manual end-to-end drive" bullet below already does, live, against real
      accounts) — it is proven there instead, not in this before/after seed.
      Per-space "before" counts and checksums recorded (see the migration-rehearsal task below).
      This dataset is **synthetic**, built for this dispatch — there is no production snapshot,
      per the settled decision; the local dev DB's real pre-existing data (12 spaces / 43 zones /
      81 items) was left untouched throughout (confirmed by count before and after this dispatch).

- [x] **Rehearse the migration** against the seeded database — `dotnet ef database update` —
      then assert:
      - per-space zone and item counts identical to the recorded "before";
      - every zone's `Position`, `Column`, `GridCols/Rows`, `RectX/Y/W/H` identical;
      - every item's `ZoneId`, `Expiry`, `SlotIndex`, `Level` identical, and every `Photo`
        checksum/length identical (FR-4 — photos are the highest-consequence column);
      - the over-cap Free space still has its over-cap content and its owner is still `Free`.

      **Done, against `TidansuDb_B22_Rehearsal`.** Recorded per-space zone/item counts, a
      `CHECKSUM_AGG` over every zone field (`Position`/`Column`/`GridCols`/`GridRows`/`RectX-H`/
      `Label`/`Color`/`Kind`/`Facing`/`Levels`/`HasDepth`/`Floor`) and every item field except
      `Photo` (`ZoneId`/`Expiry`/`SlotIndex`/`Level`/`Name`/`Quantity`/`DateAdded`/`Depth`/`Icon`),
      plus a `HASHBYTES('SHA2_256', Photo)` + `DATALENGTH(Photo)` per photo item, all **before**
      running `dotnet ef database update`. Ran the migration (timed — see § 3 C-1 below), then
      re-ran the identical query and diffed the two text captures: **byte-for-byte identical** —
      same counts (6/50, 9/80, 3/3), same checksums, same three photo hashes/lengths
      (`88E34DF1…`/4,044 B, `9DC82341…`/106,716 B, `CD4F3CDE…`/2,400,044 B), and
      `sp-free-overcap`'s owner still `Free`. Also confirmed post-migration: `sys.indexes` shows
      only `PK_Zone`/`PK_Item` (both clustered, `(SpaceId, Id)`, `SpaceId` leading) — no
      `IX_Zone_SpaceId`/`IX_Item_SpaceId` survive — and `sys.foreign_keys` still shows
      `FK_Item_Spaces_SpaceId`/`FK_Zone_Spaces_SpaceId` → `Spaces`, `CASCADE`, untouched.

- [x] **Rehearse the failure path** — deliberately break the migration (e.g. run it against a
      database where you have added a conflicting constraint) and confirm it aborts leaving the
      schema **unchanged**, with a loud error. The settled posture is fail-loud +
      restore-from-backup; this proves the "leaves the DB unchanged" half rather than assuming
      EF's transaction.

      **Done, against a second throwaway database (`TidansuDb_B22_FailTest`).** Migrated it to
      `StripeBillingFields`, then manually dropped `IX_Zone_SpaceId` ahead of time so the
      migration's own `DROP INDEX [IX_Zone_SpaceId]` step (which runs *after* `DROP CONSTRAINT
      PK_Zone` in the same migration) fails with a genuine SQL Server error (`Cannot drop the
      index … because it does not exist`). Confirmed after the failed run: `PK_Zone` is **still
      single-column on `Id`** (the preceding successful `DROP CONSTRAINT PK_Zone` in the same
      transaction was rolled back), the `Item` table was untouched entirely (the migration never
      reached it), and `__EFMigrationsHistory` has no row for `ScopeZoneItemKeysToSpace` — the
      migration aborted loudly (full `SqlException` stack trace to console) and left the schema
      exactly as it was. Both databases dropped after use.

- [x] **Manual end-to-end drive** (`run` / `verify` skills) against the migrated database:
      - **FR-1 / FR-2 (the headline)** — as user A, create a zone; note its id from the network
        tab. As user B (separate account, separate browser profile or incognito), create a zone
        forcing the *same* id. Observe: **200, zone appears in B's layout, A's zone unchanged**.
        Repeat for an item. Then repeat the whole thing across two spaces of the **same** user.
      - **FR-3 (oracle)** — from a fresh account, POST a zone with an id known to exist in
        another tenant's space, and POST one with a random id. Diff the two responses byte for
        byte: same status, same body. Then POST a zone id that already exists **in your own
        space** and confirm a clean 400 (not a 500) from the new pre-check.
      - **FR-5 (cap)** — POST `/api/spaces` with 501 zones → **400** naming the `zones`
        collection; with 500 zones → accepted (subject to the plan gate). Same for 5,001 / 5,000
        items. Confirm **nothing is persisted** on the rejected request, and that neither case
        returns a 500.
      - **FR-6 (plan gates — no regression)** — Free space at 6 zones: the 7th add still returns
        `403 {plan:["zones"]}` and **opens the paywall with `reason: zones`**. Free space at 50
        items: the 51st returns `403 {plan:["items"]}` → paywall `reason: items`. Confirm no
        mutation was applied in either case. Pro: both unlimited.
      - **FR-6 (downgrade / read-only)** — on the seeded over-cap Free space, confirm existing
        over-cap zones/items are still readable and still *editable* (`UpdateZone` has no plan
        gate by design — `UpdateZoneCommandHandler.cs:24-27`), while *adding* is blocked.
      - **FR-7 (B-15 / B-16 non-regression)** — full round-trip on both a Free and a Pro space:
        create / edit / delete a zone; create / edit / delete an item (with a photo, on Pro);
        rename the space via `PUT /api/spaces/{id}/fields`; hard-reload and confirm the layout
        renders identically. Then do the same on the **two spaces that share ids** and confirm
        editing one never touches the other — the case where a mis-scoped query surfaces as a
        cross-space edit.
      - **B-16 read path** — load the dashboard (`GetSpaceSummariesPageAsync`) and one space
        detail (`GetLayoutByIdAsync`); with the dev-only EF SQL log on, confirm no `Photo` column
        appears in the emitted SELECTs. The key change touches these projections' tables, so
        re-prove the property rather than assuming it survived.
      - **Space delete cascade** — delete a space and confirm its zones and items are gone
        (guards S-5).

      **Done, driven against the main dev DB (`TidansuDb`) via curl-equivalent scripted HTTP
      calls (no browser session available in this environment) hitting the real running API +
      real magic-link auth flow** (dev-only `devLink` from `/api/auth/magic-link`, consumed via
      `/api/auth/consume` — no SMTP). Five synthetic accounts (A–E), each on a distinct
      `X-Forwarded-For` value so the per-IP magic-link/auth rate limiters didn't collapse them
      into one partition (loopback is trusted for forwarded headers by this app's default
      config). All synthetic accounts/spaces/zones/items/tokens were deleted from `TidansuDb`
      afterward; the pre-existing real data (12 spaces / 43 zones / 81 items) was re-counted
      identical before and after.
      - **FR-1/FR-2:** user A and user B each POSTed a zone with the identical id — **both
        200**, both zones present in their respective owner's layout, no cross-contamination.
        Repeated for an item (both 200). Repeated across two spaces of the **same** user A
        (both 200). This directly disproves the pre-fix behaviour (a colliding id 500ing).
      - **FR-3 (oracle):** from a fresh account C, POSTing a zone with an id already used in
        A's space, and POSTing one with a never-used-anywhere random id, both returned **200**
        with an identical response *shape* (same JSON keys) — no status-code or structural
        signal distinguishes "exists elsewhere" from "exists nowhere". **Caveat, stated
        plainly:** a literal whole-body byte-diff is not meaningful here by construction — the
        response echoes back the `id` the caller submitted, so the two response bodies
        necessarily differ in exactly that one field (the caller already knows both ids in this
        test; the field being echoed is never someone else's secret). What *was* verified
        byte-for-byte is the code itself: the new `DbUpdateException` catch block
        (`ErrorHandlingMiddleware.cs:184-210`) and the final catch-all (`:211-228`) write the
        identical status code, the identical `Errors` dictionary key, and the identical literal
        string `"Something went wrong."` — copy-pasted, not paraphrased — so no live trigger of
        the rare DbUpdateException race (C-5) was needed to confirm its body is indistinguishable
        from the generic 500. Then POSTing a zone id that **already existed in C's own space**
        (the one just created) returned a clean **400** — `{"zone.Id": ["A zone with this id
        already exists in this space."]}`; not a 500.
      - **FR-5 (cap):** 501 zones → **400** `{"space.Zones": ["Zones must not contain more than
        500 entries."]}`. 500 zones on a **Free** account → **403** `{"plan":["zones"]}` (the
        plan gate, not the cap, correctly fires first — proving C-6's ordering). 500 zones on
        the same account after flipping it to **Pro** (direct DB update — no Stripe in dev) →
        **200**, all 500 persisted. Same shape for items: 5,001 → 400 naming `items`; 5,000 on
        Free → 403 `items`; 5,000 on Pro → 200. Confirmed nothing persisted from either rejected
        (400) request — `GET` on the never-created space ids returned 404.
      - **FR-6 (plan gates):** fresh Free account E — zones 1–6 all **200**; the 7th **403**
        `{"plan":["zones"]}`. Items 1–50 all **200**; the 51st **403** `{"plan":["items"]}`.
        Final `GET` on E's space confirmed exactly 6 zones / 50 items persisted (no partial
        mutation from either rejected add).
      - **FR-6 (downgrade/read-only):** created a 9-zone space while the owner was Pro, then
        flipped the same account to Free directly in the DB (simulating a downgrade with no
        Stripe round-trip in dev). Confirmed: `GET` still returns all 9 zones (read-only ≠
        hidden); `PUT` on an existing over-cap zone still **200** (no plan gate on Update, as
        designed); `POST` of a brand-new zone still **403** `{"plan":["zones"]}` (adding stays
        blocked while at/over cap).
      - **FR-7 (non-regression):** Free account E — edited an existing zone/item (200/200),
        deleted an item and zone to free a slot, created a replacement in each freed slot (200/
        200), renamed the space via `PUT /fields` (200), reloaded (`GET`) and got the renamed
        name with the same 6/50 counts. Pro account D — created a zone+item with a **genuine
        PNG** data URL (hand-built minimal PNG bytes, not just base64-wrapped random bytes — a
        random-byte "photo" is correctly rejected by `SpacePhotoGuard`'s magic-byte check with a
        400, confirmed along the way), edited the photo, deleted item then zone, reloaded — 0/0
        left. Then, on the FR-1 fixture (A/B's colliding-id spaces): A renamed its colliding
        zone's label; re-`GET` of **B's** space showed **B's** colliding-id zone's label
        completely unchanged — confirms editing one tenant's copy of a colliding id never
        touches the other's, the exact case a mis-scoped query would break.
      - **B-16 read path:** with the dev EF SQL log at `Information` (already on by default in
        `appsettings.Development.json`), captured the actual SQL for both reads post-migration.
        Space-detail (`GetSpaceQuery` → `GetLayoutByIdAsync`) emits one query with `LEFT JOIN
        [Zone]`/`LEFT JOIN [Item]`, and the `[i]` column list is exactly `Id, SpaceId, Name,
        ZoneId, Quantity, Tags, DateAdded, Expiry, SlotIndex, Depth, Level, Icon` — **no
        `Photo`**. Confirmed structurally in the API response too: `AddItem`'s own response
        echoes the photo just posted, but the follow-up `GetSpace` response for the same item
        always has `photo: null` — consistent, not a regression (this is `GetLayoutByIdAsync`'s
        documented "photo-less" projection, unchanged by this task). Dashboard
        (`GetSpaceSummariesPageAsync`) emits one paged query (`OFFSET`/`FETCH NEXT`) with a
        zone sub-query projecting only `Color, SpaceId, Id, Position` (top-6 via `ROW_NUMBER`)
        plus `COUNT(*)` sub-selects for zone/item totals — no `Photo`, and only the expected
        second `SELECT COUNT(*) FROM Spaces` for the pager's total, not a per-row N+1.
      - **Space delete cascade:** deleted a space with 1 zone / 1 item; a direct SQL count on
        `Zone`/`Item` for that `SpaceId` afterward returned **0/0** — cascade intact.

---

## 2. 🔒 Security Considerations

**S-1 · Cross-tenant existence oracle via error-shape divergence — 🔴 Critical**
The reason for the task. A colliding id from another tenant currently 500s while a free id
200s, letting a caller enumerate ids that exist *somewhere* in the system. The composite key
removes the collision by construction; the middleware catch removes any residual shape difference.
- [x] Verify the closure empirically (FR-3 drive) — byte-diff the two responses. "The key fix
      makes this impossible" is a claim, and the settled decision explicitly requires it to be
      *verified* rather than assumed.

      **Verified.** Both a cross-tenant colliding id and a random id return 200 with an identical
      JSON key shape — see the Verification section's FR-3 entry for the full drive and the
      stated caveat about why a literal whole-body diff isn't the right instrument (the response
      echoes the caller's own submitted id by design).
- [x] Ensure the new `DbUpdateException` clause emits the identical generic body and status as
      the existing catch-all — no 409, no constraint name, no `ex.Message` in the response.

      **Verified by source comparison** (`ErrorHandlingMiddleware.cs:184-210` vs `:211-228`):
      same `StatusCodes.Status500InternalServerError`, same `ApiOperationResult` shape, same
      `GeneralErrorKey` → `"Something went wrong."` literal, copy-pasted not paraphrased.

**S-2 · Duplicate-key error text leaks another tenant's id verbatim — 🔴 Critical**
SQL Server's duplicate-key error message embeds the colliding key value. Any path that surfaces
`DbUpdateException.InnerException.Message` hands a real zone id from another account to the caller.
- [x] Log server-side only; the response body carries the fixed generic string.

      **Confirmed** — `logger.LogError(ex, "Persistence failure: {Message}", ex.Message)` only;
      the response body never references `ex`.
- [x] Grep the API project for any other place an exception message reaches a response body.

      **Done.** `grep -n "\.Message" src/Tidansu.API` finds exactly one other place an exception
      message reaches a response body: `NotFoundException` at `ErrorHandlingMiddleware.cs:44`
      (`{ GeneralErrorKey, new[] { ex.Message } }`). Evaluated safe and **not** a B-22 regression:
      `NotFoundException`'s message (`Domain/Exceptions/NotFoundException.cs`) is
      `"{resourceType} with id: {resourceIdentifier} doesn't exist."`, where `resourceIdentifier`
      is always the id the *caller's own request* supplied (`request.Id`/`SpaceId`/`ZoneId`/
      `ItemId`) — grepped every `throw new NotFoundException` call site to confirm — never a
      value read from someone else's data. It is also thrown identically for "doesn't exist" and
      "exists but isn't yours" (the deliberate ownership-ambiguity 404), so it carries no
      existence-oracle bit either. Pre-existing, predates B-22; no change made. Also checked
      `Tidansu.Application` for any handler-level `catch` that builds a response directly — none
      found (all exception-to-HTTP mapping funnels through this one middleware) — and
      `Tidansu.Infrastructure` for any `ex.Message` reaching a caller — the three hits there
      (`StripeBillingService.cs`, `EmailService.cs`) are all server-side `LogWarning` calls, never
      returned to a client.

**S-3 · Cross-tenant mutation via an under-scoped lookup once ids are only space-unique — 🔴 Critical**
Before this task, a bare-id lookup was *accidentally* safe: ids were globally unique, so
`WHERE Id = @id` could only ever hit one row. After it, the same query can hit N rows across N
tenants. Every existing query is already space-scoped (F-5), so this is a *future* risk, not a
present defect — but the safety margin silently disappears.
- [x] Complete the `SpacesRepository.cs` query audit. *(Done in § 1, query-by-query, above.)*
- [x] Add `i.SpaceId == spaceId` to `RemoveItemAsync` so the scoping is explicit. *(Done in § 1's
      refactor task.)*
- [x] Update the D-3 comment block so the next maintainer knows the property is now structural.
      *(Done in § 1's refactor task.)*

      **Empirically re-confirmed this dispatch**, on top of the static audit: five synthetic
      accounts (A–E) driven concurrently against overlapping/colliding zone/item ids, including
      an explicit cross-space edit-isolation check (A edits its copy of a colliding-id zone; B's
      same-id zone in B's own space is re-`GET` and shown unchanged) — no cross-tenant bleed
      observed anywhere in the drive.

**S-4 · Resource exhaustion via unbounded zone/item collections — 🟠 High**
`POST /api/spaces` accepts an unbounded `Zones`/`Items` array, and `PlanPolicy.CheckNewSpace`
skips the zone check entirely for Pro (cap is `null`) — so a Pro account can post ~120,000 zones
in one ~24 MB request.
- [x] Land the FR-5 caps (500 / 5,000) in `SpaceDtoValidator`. *(Done in § 1.)*
- [x] Order the cap rule **before** the per-element `RuleForEach`, structurally
      (`DependentRules` / `CascadeMode.Stop`), so the expensive validation never runs on an
      oversized payload. *(Done in § 1, via `DependentRules`.)*

      **Empirically confirmed this dispatch:** 501 zones/5,001 items → clean 400 naming the
      collection, regardless of plan; 500/5,000 → accepted, gated only by the plan check (see
      Verification's FR-5 entry).

**S-5 · FK cascade silently downgraded by the PK rebuild — 🟠 High**
If EF drops and re-adds `FK_Zone_Spaces_SpaceId` / `FK_Item_Spaces_SpaceId` around the key swap
and the regenerated FK loses `onDelete: Cascade`, deleting a space would leave orphaned
zones/items — rows belonging to a deleted account, retained indefinitely.
- [x] Check `onDelete: ReferentialAction.Cascade` on any re-added FK in the generated migration.

      **Confirmed both ways:** the generated migration never touches the FKs at all (only
      `DropPrimaryKey`/`DropIndex`/`AddPrimaryKey`), and a direct `sys.foreign_keys` query against
      the post-migration rehearsal database shows both `FK_Item_Spaces_SpaceId` and
      `FK_Zone_Spaces_SpaceId` still pointing at `Spaces` with `delete_referential_action_desc =
      CASCADE`.
- [x] Drive a space-delete after migrating and confirm the cascade still fires.

      **Confirmed** on the main dev DB (post-migration): deleted a space with 1 zone / 1 item; a
      direct SQL count for that `SpaceId` in `Zone`/`Item` afterward returned 0/0.

**S-6 · Denial of service against another tenant (the original filed vulnerability) — 🟠 High**
Squat the ~46,656-value `uid()` space and other users' first zone-add fails.
- [x] Confirm closed by driving FR-1/FR-2 with deliberately colliding ids across two accounts.
      No rate-limiting change and no `uid()` change is in scope — the key fix is the structural
      close.

      **Confirmed.** Users A and B (and A's two own spaces) each successfully created a
      zone/item with the identical id — 200 in every case, no 500, no cross-tenant effect. See
      Verification's FR-1/FR-2 entry.

---

## 3. 📈 Scalability / Correctness Considerations

**C-1 · Clustered-index rebuild cost and lock duration during migration**
`DROP`/`ADD PRIMARY KEY` on `Zone` and `Item` rebuilds each table under a schema-modification
lock; `Item` carries `nvarchar(max)` photo LOB data, so the rebuild moves real bytes.
- [x] Time the migration against the seeded dataset (including the >1 MB photo rows) and record
      the duration. On a low-traffic pre-launch system this is almost certainly seconds — but
      measure it rather than discovering it in production.

      **Measured, on `TidansuDb_B22_Rehearsal`** (18 zones / 133 items total across the three
      seeded spaces, including one 2,400,044-byte `Photo` LOB): each of the four DDL statements
      (`DROP CONSTRAINT PK_Zone`, `DROP INDEX IX_Zone_SpaceId`, `DROP CONSTRAINT PK_Item`,
      `DROP INDEX IX_Item_SpaceId`) plus the two `ADD PRIMARY KEY` statements executed in
      **0-5 ms each** per EF's own per-command timing log — roughly **12 ms of total DDL time**.
      The `dotnet ef database update` process wall-clock was ~3.6 s, but that is CLI/tool
      startup overhead, not migration execution. At this pre-launch data volume the rebuild is,
      as expected, imperceptible; the number is recorded here rather than assumed.

**C-2 · Redundant index write amplification**
`IX_Zone_SpaceId` / `IX_Item_SpaceId` become fully redundant once `SpaceId` leads the PK —
keeping them costs an extra index write on every insert for zero read benefit.
- [x] Confirm they are dropped (by EF or explicitly).

      **Confirmed twice:** the generated migration's own `DropIndex` calls, and a direct
      `sys.indexes` query against the post-migration rehearsal database showing only `PK_Zone`/
      `PK_Item` remain on their respective tables (no `IX_Zone_SpaceId`/`IX_Item_SpaceId`).

**C-3 · Read-path improvement worth confirming, not assuming**
Every hot query filters by `SpaceId` first (`GetLayoutByIdAsync`, `CountZonesAsync`,
`CountItemsAsync`, `RemoveZoneWithItemsAsync`). A `(SpaceId, Id)` clustered key co-locates a
space's rows, so these become range scans over contiguous pages.
- [x] With the dev-only EF SQL log on, confirm the space-detail read still emits one
      projection/split-query shape and that no per-row N+1 appeared. Do not claim a performance
      win without looking at the emitted SQL.

      **Confirmed against the main dev DB, post-migration, EF SQL log at `Information`** (on by
      default in `appsettings.Development.json`): `GetSpaceQuery`/`GetLayoutByIdAsync` still
      emits exactly one query (`LEFT JOIN Zone`/`LEFT JOIN Item` off one owner-scoped `Spaces`
      subquery) — no split-query, no per-row N+1. `GetSpacesQuery`/`GetSpaceSummariesPageAsync`
      emits its one paged query plus the expected single `SELECT COUNT(*)` for the pager total —
      not a per-row N+1 either. No performance-*win* is claimed here (that would need a
      before/after timing at real scale, out of this dispatch's reach); only that the query
      *shape* survived the key change unchanged, which was the property to confirm.

**C-4 · `AsNoTracking` and projection integrity across the key change**
`GetLayoutByIdAsync` projects into entity instances under `AsNoTracking()`; `GetZoneAsync` /
`GetItemAsync` are *deliberately tracked* (`SpacesRepository.cs:255-258`).
- [x] Re-read that comment before touching either. Adding `AsNoTracking()` to the tracked
      lookups would make every zone/item field update a silent no-op — a data-loss bug that
      looks like an obvious optimisation.

      **Confirmed no violation.** This dispatch made no code changes (verification only); the
      comment and the tracked/untracked split are exactly as the implementation dispatch left
      them. The live drive's `UPDATE`/edit operations (zone label edits, item photo edits) all
      persisted correctly on reload, which is the behavioural evidence the tracked lookups are
      still tracked.

**C-5 · The duplicate-id pre-check is a check-then-insert race**
The new `ZoneExistsInSpaceAsync` / `ItemExistsInSpaceAsync` pre-checks can lose to a concurrent
duplicate add, which then hits the DB constraint.
- [x] Accept this deliberately: the pre-check turns the *common* case into a clean 400, and the
      middleware backstop makes the rare racing case a safe generic 500. Do **not** widen
      `sp_getapplock` to cover it — that would serialize every add for a race that costs nothing
      and leaks nothing. Record the decision in a code comment next to the pre-check.

      **Confirmed present** — `AddZoneCommandHandler.cs`/`AddItemCommandHandler.cs` both carry a
      "C-5" comment next to the pre-check stating it's a check-then-insert race, not enforcement,
      and explicitly declining to widen `sp_getapplock`. Not independently re-verified by forcing
      the actual race in this dispatch (accepted per the plan's own reasoning: the race is rare,
      costs nothing, and leaks nothing — forcing it would mostly prove EF/SQL Server's own
      constraint-violation behaviour, not this codebase's).

**C-6 · Validation ordering vs. the plan gate**
FluentValidation runs before handlers, so the FR-5 400 preempts the FR-6 paywall 403 for
oversized requests.
- [x] Confirm the caps (500 / 5,000) sit far enough above the Free caps (6 / 50) that no
      legitimate Free user can meet the 400 before the 403 (FR-6's explicit constraint).

      **Empirically confirmed:** a Free account POSTing exactly 500 zones (at the FR-5 cap, well
      above Free's 6-zone plan cap) got **403 `{"plan":["zones"]}`**, not the FR-5 400 — the
      plan gate fires first for any request the cap alone would let through, exactly as C-6
      requires. Same for 5,000 items → 403 `{"plan":["items"]}`.

---

## 4. 📦 New Dependencies

No new dependencies required. The composite key is EF Core configuration, the caps are
FluentValidation rules on an existing validator, and the error mapping extends existing
middleware. `Tidansu.API` already references `Tidansu.Infrastructure`
(`src/Tidansu.API/Tidansu.API.csproj:23`), so `DbUpdateException` is already in scope — do not
add `Microsoft.EntityFrameworkCore` to the API `.csproj`.

---

## 5. ❓ Open Questions

*(None of the settled kickoff decisions — id strategy, cap values, synthetic dataset, fail-loud
rollback, B-15 attribution — are open. These are new questions raised by the investigation.)*

1. **Should `Item.ZoneId` gain a real FK to `Zone(SpaceId, Id)` — and if so, is it this slice?**
   The composite key makes such an FK *expressible* for the first time (the target is now
   `(SpaceId, Id)`, both of which `Item` already carries). Today the referential rule is enforced
   only in `AddItemCommandHandler` via `ZoneExistsInSpaceAsync`, so `UpdateItem` can still move
   an item to a non-existent zone, and any dangling `ZoneId` in existing data goes undetected.
   **Recommendation: not in this slice.** It changes delete semantics, would need a data-cleanup
   pass for dangling rows, and would turn a bad `ZoneId` into a 500 — the exact failure class
   this task exists to remove. File as a follow-up; needs a product/tech call.

2. **Is `ErrorHandlingMiddleware` the right seam for `DbUpdateException`, or should the
   repository translate it into a Domain exception?** Catching an EF type in the API project is
   consistent with existing precedent in that file and needs no new reference, so it is the
   low-friction choice and what this plan specifies. The deeper alternative: `SpacesRepository`
   catches `DbUpdateException` and rethrows a Domain `PersistenceException`, keeping EF entirely
   behind the repository seam and giving the middleware a Domain-typed catch like every other
   clause. That is arguably the more correct layering and a smaller interface for the middleware
   to know about. **Recommendation: ship the middleware catch now; if the reviewer prefers the
   deeper seam it is a mechanical follow-up.** Good candidate for `design-an-interface` if the
   human wants it explored properly — flagged here because the tech-lead agent cannot run that
   skill.

3. **Does any *other* table or query outside `SpacesRepository` read `Zone`/`Item`?** The grep
   for `Set<Zone>` / `Set<Item>` / `FindAsync` found hits only in `SpacesRepository.cs`, and
   `TidansuDbContext` exposes no `DbSet<Zone>` / `DbSet<Item>` (they are reached only via
   `Space.Zones` / `Space.Items`), which is strong evidence the answer is no. Worth one
   confirming pass during implementation — a stray raw-SQL or reporting query keyed on bare `Id`
   is the one thing this plan has not accounted for.

4. **Is there a real deployment/backup procedure to point at for the fail-loud recovery path?**
   The settled posture is "abort loudly, restore from backup," which presumes a backup exists and
   someone knows how to restore it. Not blocking implementation, but the verification write-up
   should either name the procedure or state plainly that none exists yet.
