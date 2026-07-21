---
id: B-22
slug: scoped-zone-item-keys
title: Zone/Item primary keys are globally unique + client-supplied → cross-tenant DoS
status: in-review   # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: []
touch-points:
  - src/Tidansu.Infrastructure/Persistence/TidansuDbContext.cs
  - src/Tidansu.Infrastructure/Migrations/  # new migration (schema + data)
  - src/Tidansu.Application/**/SpaceDtoValidator.cs
  - src/Tidansu.Application/**/ZoneDto.cs   # ToEntity
  - src/Tidansu.Application/**/ItemDto.cs   # ToEntity
  - src/Tidansu.App/src/data/spaces.ts      # uid()
---

# B-22 · Zone/Item primary keys are globally unique + client-supplied → cross-tenant DoS

## Description
One user can currently make other users' app break. Zone and item identifiers are
unique across the *entire* system rather than within the owning space, and the
browser hands those identifiers to the server as-is — generated from a clock, not
randomly, so they are easy to predict. A single account can claim a large block of
the likely identifiers, after which other people's attempt to add their first zone
fails with a server error, and reloading the page reproduces it. The same mismatch
also lets an outsider probe whether a given identifier exists anywhere in the
system. After this task, one person's data can no longer collide with or reveal
anything about another person's.

## Acceptance criteria
- [x] Two different users (and two different spaces of the same user) can each hold
      a zone/item with the *same* identifier, with no error.
      **Verified 2026-07-21** — driven live against the running API (5 synthetic accounts,
      X-Forwarded-For-partitioned): user A and user B each created a zone/item with the
      identical id, both 200, no cross-effect; the same user's two own spaces likewise. See
      `tech-tasks.md` Verification § FR-1/FR-2.
- [x] Adding a zone or item whose id is already taken elsewhere in the system
      succeeds; it no longer returns a 500 / `DbUpdateException`.
      **Verified** — same drive as above; every colliding-id add returned 200, none 500.
- [x] The endpoints no longer behave as an existence oracle — a caller cannot
      distinguish "this id exists in someone else's space" from "it does not".
      **Verified, with a stated caveat** — a fresh account's add of a cross-tenant-colliding id
      and of a never-used id both return 200 with an identical response shape (no status/shape
      signal). A literal whole-response byte-diff isn't meaningful by construction (the response
      necessarily echoes back the id the caller itself chose); the `DbUpdateException` middleware
      clause's body/status was confirmed byte-identical to the generic 500 by source comparison
      instead. See `tech-tasks.md` § FR-3 and S-1/S-2.
- [x] Existing zones/items and their photos survive the migration; no space loses
      content and layouts render unchanged after upgrade.
      **Verified on a synthetic rehearsal dataset**, not a production snapshot (none exists, per
      the settled decision) — a separate throwaway database seeded with representative spaces
      (Free at-cap, Free over-cap/downgraded, Pro with photos including a >1 MB blob), migrated,
      and diffed before/after: identical counts, identical field checksums, identical photo
      SHA-256 hashes/lengths. The main dev DB's real pre-existing data (12 spaces / 43 zones / 81
      items, already migrated before this dispatch) was re-counted identical throughout this
      dispatch, and the same query shape (`GetLayoutByIdAsync`) was exercised successfully against
      it many times during the live drive — but no independent pre-migration field checksum of
      that specific real data was taken (the migration had already been applied before this
      verification pass started). See `tech-tasks.md` Verification § migration rehearsal.
- [x] A bounded number of zones/items is accepted per request (defence-in-depth
      cap), and exceeding it is a clean validation error, not a 500.
      **Verified** — 501 zones / 5,001 items → clean 400 naming the collection, regardless of
      plan; nothing persisted. See `tech-tasks.md` § FR-5.
- [x] Free-plan zone/item caps and their paywall `reason`s (`zones`, `items`) still
      fire exactly as before — no regression to plan gating.
      **Verified** — Free accounts hit `403 {"plan":["zones"]}` / `{"plan":["items"]}` at exactly
      6/50, with no partial mutation; the FR-5 cap sits far enough above these that it never
      preempts the paywall (confirmed at exactly 500/5,000 on Free). Downgrade read-only also
      verified: over-cap content stays readable and editable, only adding is blocked. See
      `tech-tasks.md` § FR-6.
- [x] Frontend save/hydrate round-trip still works; no regression to B-15's granular
      zone/item endpoints or B-16's slimmed read path.
      **Verified at the API level** (create/edit/delete zone+item, photo on Pro, space rename,
      reload — all correct) **and via `npm run build` (vue-tsc) green**, confirming F-7's "no
      contract change" claim. **Caveat:** this environment has no browser session available, so
      the actual Vue UI was not clicked through live; the round-trip was driven via direct HTTP
      calls against the real API (the same requests the frontend's Kiota client would issue) plus
      the frontend's own static type-check, not an in-browser session. B-16's read-path slimming
      was independently re-confirmed via the live EF SQL log (no `Photo` column in either read
      query). See `tech-tasks.md` § FR-7 and B-16 read path.

## Notes
**Attribution — settled, do not relitigate.** Surfaced by the B-15 security review
(🟠 S-H1) but **pre-existing**; the B-15 orchestrator verified B-15 made the attack
*harder*, not cheaper (`POST /api/spaces` already allowed ~120,000 zones in one
24 MB request, versus 46,656 individually rate-limitable requests after B-15).
Do **not** "fix" this by reverting any part of B-15. See
`docs/active/tasks/B-15-granular-space-endpoints/task.md` (§ "Deliberately NOT
fixed here").

**The three composing facts** (all verified at filing time):
1. `PK_Zone` / `PK_Item` are on `x => x.Id` alone
   (`Migrations/20260621142555_SpacesZonesItems.cs:57,90`); `SpaceId` is only an FK.
2. `ZoneDto.ToEntity` / `ItemDto.ToEntity` take `Id` from the client verbatim;
   validators only check `NotEmpty().MaximumLength(64)`.
3. `src/Tidansu.App/src/data/spaces.ts:39-41` generates ids from a counter that
   resets on page load plus the low 3 base36 digits of the ms epoch — 46,656
   values, cycling ~47s.

**DECIDED at kickoff (user, 2026-07-21) — id strategy = composite key.**
`HasKey(z => new { z.SpaceId, z.Id })` on `Zone` and `Item`, scoping ids to their
owning space, plus the schema + data migration that implies. **Rejected:**
server-assigned ids (changes the DTO contract and breaks the frontend's
optimistic-add path, which needs the id before the response lands) and a CSPRNG
`uid()` (only lowers collision *probability*; it does not close the cross-tenant
coupling structurally). The client's clock-derived `uid()` is therefore **left
as-is** — do not rewrite it in this slice; once ids are space-scoped its
predictability is no longer a cross-tenant issue.

**DECIDED at kickoff (user, 2026-07-21) — oracle fix = key fix + explicit error
mapping.** The composite key closes the 200-vs-500 oracle by construction (a
colliding id from another tenant now simply succeeds), and that must be *verified*
rather than assumed. **On top of that**, audit these paths so a `DbUpdateException`
can never surface as a raw 500: map persistence failures to a generic error in
`ErrorHandlingMiddleware` so any *future* collision leaks nothing either. Both
halves are in scope.

**Migration is real work, not a footnote.** Existing rows must be preserved, and any
FK from `Item` → `Zone` (if one exists) has to be re-pointed at the new composite
key. Expect that to dominate the task.

**Defence-in-depth**: cap zone/item collection length in `SpaceDtoValidator`
regardless of which id strategy wins — currently unbounded, and Pro's zone cap is
`null` so `CheckNewSpace` skips the check entirely.

**RESOLVED at the requirements gate (user, 2026-07-21)** — all three of the PM's
open questions are answered; none remain open:
- **Collection cap = 500 zones / 5,000 items per request.** ~100× the Free per-space
  cap (6 zones / 50 items) so it can never bite a legitimate Pro user, and ~240×
  below the ~120,000-zone single-request attack volume. Exceeding it is a clean
  `SpaceDtoValidator` failure (400), never a 500.
- **No production snapshot exists.** The migration must be rehearsed against a
  **synthetic** dataset the developer builds — shaped per FR-4's representative
  samples (a Free space, an over-cap read-only space post-downgrade, and a Pro
  space with photo blobs). Verification cannot claim prod-shaped coverage.
- **Rollback posture = fail-loud.** No down-migration is required. If the data
  migration cannot complete safely it must abort loudly and leave the database
  unchanged (transactional / all-or-nothing), with restore-from-backup as the
  recovery path. Do not build partial-progress or resume machinery.

**RESOLVED at the tech-planning gate (user, 2026-07-21)** — both of the tech-lead's
open questions are answered; none remain open:
- **❓1 — do NOT add the missing `Item` → `Zone` FK.** Out of scope. `Item.cs:9-10`
  documents the loose coupling as deliberate and the referential check lives in
  `AddItemCommandHandler.cs:33`. Adding it would turn a zero-row key swap into a
  real data migration that *can* fail on orphaned rows. File it separately if
  wanted; do not fold it in here.
- **❓2 — map `DbUpdateException` in `ErrorHandlingMiddleware`.** Chosen over a
  repository-seam Domain `PersistenceException` for consistency with existing
  precedent and no new references, accepting that the API layer knows one EF type.
  The better-layering alternative was considered and deliberately declined — it is
  a cleaner abstraction nothing else currently needs.

**TECH-PLANNING FINDINGS (tech-lead, 2026-07-21)** — see
[`./tech-tasks.md`](./tech-tasks.md) § 0 for the evidence behind each:
- **There is no `Item` → `Zone` FK.** The brief's highest-risk unknown resolves to "nothing
  to re-point": the only FKs are `FK_Zone_Spaces_SpaceId` / `FK_Item_Spaces_SpaceId`, both
  onto `Spaces.Id`, whose key is unchanged. `Item.ZoneId` is a bare column, enforced in the
  application layer. The developer must **not** add one opportunistically (Open Question ❓1).
- **This is a key-definition migration, not a data migration — zero rows change.** And it
  *cannot* fail on existing data: `(Id)` was already unique table-wide, so `(SpaceId, Id)` is
  unique by construction. EF generates it in one migration; no raw SQL. EF's default
  per-migration transaction already satisfies the settled fail-loud/all-or-nothing posture —
  the one thing that would break it is `suppressTransaction: true`.
- **`Item.Photo` is still `nvarchar(max)` on `Item`.** B-15 and B-16 were both schema-neutral
  (no migration exists after `StripeBillingFields`); B-16 only slimmed the read *projections*.
  Blob preservation is the clustered-index rebuild's guarantee, not script work.
- **B-15/B-16/B-12 non-regression looks structurally safe but is not assumed.** Every
  `SpacesRepository` query is already rooted at an owner-scoped space, and the `sp_getapplock`
  resource derives from `SpaceId`/`UserId` only — explicit audit tasks confirm each rather
  than reasoning about it.
- **No DTO/route change ⇒ no Kiota regen and no frontend work.** B-21's broken
  `npm run build:api` therefore does not block this task (workaround documented in-plan only
  in case an implementation choice changes a contract).
- **New work the requirements implied but did not name:** an in-space duplicate-id pre-check
  in `AddZone`/`AddItem` and intra-request duplicate-id validator rules. Without them, a
  duplicate id *within the caller's own space* still 500s after the key fix — which FR-3 and
  FR-5 both forbid. Needs a new `ItemExistsInSpaceAsync` repository method.
- **Open questions for the human:** whether to add the `Item`→`Zone` FK as a follow-up (❓1);
  whether `DbUpdateException` mapping belongs in the middleware or behind the repository seam
  (❓2 — a `design-an-interface` candidate the tech-lead agent cannot run); and whether a real
  backup/restore procedure exists for the fail-loud recovery path (❓4).

### Related / out of scope
- **B-21** (`npm run build:api` is broken) — if this task changes any DTO contract,
  the Kiota regen will need B-21's documented workaround (boot the API, curl
  `/swagger/v1/swagger.json`). Don't fix B-21 here.
- Plan/billing logic (B-10, B-9) — untouched.
- Photo upload/serving (B-1) — untouched, but the migration must not disturb stored
  photo blobs.

**REVIEW GATE OUTCOME (2026-07-21).** Two reviewers ran in parallel on partitioned
scopes — `branch-code-reviewer` → [`./review.md`](./review.md) (correctness /
convention / scope creep), `security-reviewer` → [`./security-review.md`](./security-review.md)
(trust / leakage / fail-open). **No 🔴 Critical.** Both 🟠 Majors were in
`SpaceDtoValidator` and were **fixed inline at the gate** (user-approved), then
re-verified:
- **M1 — collation mismatch (the real find).** `HasNoDuplicateIds` used ordinal
  `Distinct()`, but the composite key is enforced under `SQL_Latin1_General_CP1_CI_AS`
  (case- and trailing-whitespace-insensitive). `z1`/`Z1` and `z1`/`z1 ` passed the
  validator, passed EF's equally-ordinal change tracker, and died at
  `SaveChangesAsync` → a 500, exactly what FR-3/FR-5 forbid. Fixed with `TrimEnd()` +
  `StringComparer.OrdinalIgnoreCase`. Only the in-memory `CreateSpace` graph path was
  exposed; the granular `AddZone`/`AddItem` pre-checks evaluate in SQL and already
  inherited the CI collation.
- **M2 / S-M1 (found independently by both reviewers) — cap rules NRE'd on explicit
  JSON `null`;** the `= []` initializer only covers an *omitted* key. Fixed with
  `.Cascade(CascadeMode.Stop).NotNull()`, matching `ItemDtoValidator`'s existing
  `Tags` guard.
- **N2 — `RemoveItemAsync`'s comment gave the wrong reason,** claiming global
  uniqueness had been load-bearing. It never was: `s.Id == spaceId ∧ s.Id == i.SpaceId`
  already entailed the correlation. Comment corrected; the refactor itself is
  behaviour-preserving.

**Verified after the fixes:** `dotnet build` 0 errors, `dotnet test
tests/Tidansu.Domain.Tests` 62/62, `npm run build` (vue-tsc) clean, plus a throwaway
harness confirming both previously-passing id pairs are now rejected with no false
positives on genuinely-distinct ids.

**Residual, deliberately NOT fixed here — filed as [B-23] (P1):** `Space.Id` has the
**identical** bug one level up (no `HasKey`, verbatim client id, same 46,656-value
`uid()`, unlimited Pro spaces, no rate limiter). B-22's `DbUpdateException` clause does
not close it — it hides the message but still emits a 500, so the oracle signal
survives. B-23 has no composite-key option since `Space` is the tenancy root.
⚠️ **This task's comments about space-scoping being "structural" are accurate for
`Zone`/`Item` only** and read repo-wide (🟡 S-L2) — do not read them as covering `Space`.

**Known gap worth filing separately:** there is no `Tidansu.Application.Tests` project.
Both 🟠s were validator logic that no existing suite could have caught; the reviewer
found them by writing the ten-line test that does not exist.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
