# Tidansu — Security Review

**Date:** 2026-07-16
**Scope:** B-15 (`granular-space-endpoints`) — uncommitted working tree vs `HEAD` (`bf9e169`).
`git diff HEAD -- src tests` + untracked. Excludes `.claude/agent-memory/**` and the
generated Kiota client. Correctness/convention findings are `review.md`'s
(branch-code-reviewer); this report is trust-boundary / authz / fail-open / secret-leak only.
**Type:** Findings report only — no code changes made.

**Overall:** The data path is sound. I could not construct a path to another user's zone
or item, a plan-cap bypass, or a secret disclosure. Every one of the six surfaces the task
brief nominated holds under tracing, including the four the brief asked me to independently
re-verify. There is **one net-new finding worth acting on** (S-H1), and it is not an IDOR —
it's a trust issue in the opposite direction: the server accepts the **client's chosen
primary key** for new zones/items, that key is **globally unique across all tenants**, and
the client mints it from a **clock, not a CSPRNG**. That makes one authenticated account
able to squat the id space and deny zone/item creation to every other user. The root cause
predates B-15; B-15 is what makes it cheap to exploit at scale.

## What's already done right

Verified by tracing, not by reading the comments:

- **FR-10 ownership is genuinely structural.** Every new read/mutate roots at
  `dbContext.Spaces.Where(s => s.Id == spaceId && s.UserId == userId)` —
  `GetByIdWithoutContentAsync`, `CountZonesAsync`, `CountItemsAsync`, `GetZoneAsync`,
  `GetItemAsync`, `ZoneExistsInSpaceAsync` (`SpacesRepository.cs:135-177`), and the
  unlocked Pro inserts `AddZoneAsync`/`AddItemAsync`, which gate on an owner-scoped
  `AnyAsync` before the insert (`:304-322`). There is no overload that resolves a zone or
  item by bare id, so an unscoped mutation is not expressible through this repository.
- **The documented `RemoveZoneWithItemsAsync` exception is safe** (`:344-346`).
  `zone.SpaceId` is owner-verified because `zone` came from the owner-scoped `GetZoneAsync`
  two lines up (`:326`). The `ExecuteDeleteAsync` predicate is
  `i.SpaceId == zone.SpaceId && i.ZoneId == zoneId` — `zoneId` alone is attacker-supplied,
  but it is conjoined with an owner-resolved `SpaceId`, so it can only ever reach rows
  inside the caller's own space.
- **`RemoveItemAsync` was rewritten to set-based *during* this audit and the rewrite is
  ownership-safe** (`:362-369`). The new EXISTS subquery
  `dbContext.Spaces.Any(s => s.Id == spaceId && s.Id == i.SpaceId && s.UserId == userId)`
  forces `i.SpaceId == spaceId` *and* owner-checks that space, inside the DELETE's own
  WHERE. It is a second exception to D-3's "root at `Spaces`" shape, but not a hole:
  cross-user and unknown ids both affect 0 rows → `false` → the same 404. Worth adding to
  D-3's comment as exception #2 so a future reader doesn't have to re-derive it.
- **404/403 non-divergence holds, and cannot diverge.** There is **no `ForbidException`
  anywhere under `Tidansu.Application/Spaces/` or the controllers** (grep-confirmed).
  Unknown and cross-user ids collapse into one `null`/`false` branch per handler before
  any branch that could tell them apart. The only response variance is the caller-supplied
  id echoed by `NotFoundException` — which the caller already knows.
- **The reviewer's lock-before-ownership claim is correct — I re-derived it.** A cross-user
  id **cannot** reach `sp_getapplock`. `AddZoneCommandHandler.cs:26-27` and
  `AddItemCommandHandler.cs:28-29` both run the owner-scoped `CountZonesAsync`/`CountItemsAsync`
  and `?? throw new NotFoundException` *before* the repo call. The lock resource is
  `HashForLock(zone.SpaceId)` where `SpaceId` is the already-owner-verified route id, so
  there is no cross-user lock-contention DoS either. Non-issue, confirmed.
- **The `sp_getapplock` fail-closed property (T-16) holds in all three copies.**
  `AddWithinSpaceCapAsync:75-95`, `AddZoneWithinCapAsync:206-227`, `AddItemWithinCapAsync:262-278`
  each capture the RETURN code via `ToListAsync().Single()` and surface `lockResult < 0` as
  an `InvalidOperationException` → generic 500, **never** a `PlanLimitException`. No
  discarded return value; no path falls through to count+insert without the lock. The
  in-lock re-count is not skippable — it is the only thing standing between the lock
  acquisition and the `Add`.
- **The lock message doesn't leak.** It interpolates the space id into the exception, but
  `ErrorHandlingMiddleware.cs:184-200` catches generic `Exception` and returns a flat
  `"Something went wrong."` — no message, no stack. (And the id is the caller's own.)
- **Plan gate: no ungated insert exists.** Both insert branches in each add handler sit
  behind `PlanPolicy.CheckAddZone`/`CheckAddItem`, and the finite-cap branch re-decides
  authoritatively under the lock (`ContentInsertOutcome.AtCap` → `PlanLimitException`).
  The pre-check is correctly treated as an optimisation, not as authoritative. The Free/Pro
  split keys off `PlanCaps.For(user.Plan).Zones is int cap` — the same discriminator
  `CheckAddZone` uses, so the two cannot disagree.
- **Plan is read from the DB, not the JWT.** Handlers resolve `user.Plan` via
  `userService.FindByIdAsync(userId)`; `CurrentUser` (`UserContext.cs:3`) carries no `Plan`
  claim at all. A downgraded user holding a stale Pro token gets Free enforcement. This is
  the right shape and it would be easy to get wrong.
- **The photo trust boundary is intact.** Gate strictly before guard in both
  `AddItemCommandHandler.cs:41-47` and `UpdateItemCommandHandler.cs:44-55`. `UpdateItem`
  reads `existingPhoto` into a local *before* any DTO assignment (`:44`) — the T-13e trap is
  avoided. Both validators carry an explicit "do not add a photo rule here" comment
  explaining that `ValidationBehavior` would preempt the 403. A Free user sending an
  invalid photo gets 403 `photos`, not the guard's 400.
- **No photo is ever logged or interpolated** (B-13 S-5 holds). Grep-confirmed: the only
  references are `SpacePhotoGuard.ThrowIfInvalid(dto.Photo, "Item.Photo")` — a **static**
  error key, never the blob. `SpacePhotoGuard`'s messages are `const`. `PhotoPolicy.Check`
  is span-based with no regex (no ReDoS over a ~7 MB attacker string), bounds the header
  scan to 64 chars, rejects on length before parsing, checks decoded size arithmetically
  before decoding, and sniffs magic bytes against the declared type — a spoofed
  `data:image/png;base64,<script>` is rejected.
- **`PhotoChangeBetween` gets both traps right** (`PhotoPolicy.cs:159-165`): `(null, "")` →
  `Added` (so `""` hits the 403 paywall, not the 400), and an identical resent photo →
  `None` (so downgraded users' photo-bearing items stay editable).
- **Request-size limits are right.** `[RequestSizeLimit(8MB)]` on both item routes
  (`SpaceItemsController.cs:22,36`); zone routes carry none and correctly so — `ZoneDto`
  has no photo field and every string on it is length-capped by `ZoneDtoValidator`.
- **No SQL injection.** The `SqlQuery<int>` interpolations are `FormattableString` →
  parameterized, and the resource is a SHA-256 hex digest anyway. No other raw SQL.

## Security findings

### Critical

None.

### High

**S-H1 — Client-supplied, globally-unique, clock-derived primary keys let one account squat the zone/item id space and deny creation to every other user**

`ZoneDto.cs:44-46` / `ItemDto.cs:36-38` (`ToEntity` → `Id = Id`),
`SpacesRepository.cs:245` / `:293` / `:309` / `:319` (`Set<Zone>().Add`, `Set<Item>().Add`),
`Migrations/20260621142555_SpacesZonesItems.cs:57,90` (`PK_Item`/`PK_Zone` on `x => x.Id`),
`src/Tidansu.App/src/data/spaces.ts:40-42` (`uid`).

Three facts compose into a cross-tenant DoS:

1. **The client picks the primary key.** `POST /api/spaces/{id}/zones` takes `ZoneDto.Id`
   verbatim into the entity. `ZoneDtoValidator` only checks `NotEmpty().MaximumLength(64)`.
2. **That key is global, not per-space.** The migration declares
   `table.PrimaryKey("PK_Zone", x => x.Id)` — `SpaceId` is only an FK, not part of the key.
   So one zone id is unique across **all tenants**.
3. **The id is minted from a clock, not a CSPRNG.**
   ```js
   let _id = 0;
   export const uid = (p = 'id'): string =>
       `${p}_${(++_id).toString(36)}${Date.now().toString(36).slice(-3)}`;
   ```
   `_id` is a module-level counter that **resets to 0 on every page load**, so the first
   zone of any session is always `zone_1<suffix>`. The suffix is the low 3 base36 digits of
   the ms epoch — **36³ = 46,656 values, cycling every ~46.7 seconds**. It is not random; it
   is a clock reading, so it is also *predictable* if you know roughly when the victim acts.

**Exploit path.** Attacker registers, upgrades to Pro (zones/items uncapped → `PlanCaps.For(Pro).Zones is null`
→ `AddZoneAsync`, no lock, no cap), and issues ~46,656 `POST /api/spaces/{own}/zones` calls
covering the entire `zone_1***` key space into their own space. Repeat for `item_1***`.
Total ~93k tiny rows — minutes of traffic, one account. Thereafter, **every other user in
the system** who adds their first zone of a session mints `zone_1<clock>`, collides on
`PK_Zone`, and `SaveChangesAsync` throws `DbUpdateException` → the generic catch at
`ErrorHandlingMiddleware.cs:184` → **500 "Something went wrong."** The zone never persists
and the client has no way to recover: a reload resets `_id` to 0 and mints a colliding id
again. Same for items. A Free attacker can do a slower version across many magic-link
accounts (12 zones each). Note the 403/404/500 also forms a **global existence oracle** —
200 vs 500 reveals whether an id exists in *any* tenant — though with no content disclosure
that is the lesser half.

**Honesty about attribution:** the root cause predates B-15 — `POST /api/spaces` already
accepted client-chosen `Space.Id`/`Zone.Id`/`Item.Id`, and a Pro user could have stuffed a
large graph through the old 24 MB `PUT`. What B-15 changes is **reachability and cost**: the
new granular endpoints turn "one 24 MB whole-graph POST, cap-checked against the submitted
graph" into an **unbounded stream of cheap, individually-uncapped single-row inserts**. That
is a material widening of an existing hole, on exactly the surface this task created. I am
rating it High on impact-and-now-practical rather than novelty.

**Fix** (any one closes it; the first is the real fix):
- **Make the key per-space**: `HasKey(z => new { z.SpaceId, z.Id })` for `Zone` and `Item`.
  Collisions then only exist within a space the caller already owns, and cross-tenant
  squatting becomes impossible by construction. This needs a migration — note this
  legitimately overrides the plan's D-5 "no migration needed" conclusion, which was reasoned
  from *feature* requirements and did not consider the key's tenancy. Escalate rather than
  quietly skip.
- **Or** mint ids server-side on add (ignore `dto.Id`, return the assigned id — the client
  already consumes the response via `toZone(res.data)` in `useSpacesApi.ts:44-45`, so the
  frontend blast radius is small).
- **Or, at minimum**, switch `uid()` to `crypto.randomUUID()` and catch `DbUpdateException`
  on unique-violation to return a 409 rather than a 500. This shrinks the oracle and makes
  squatting infeasible, but leaves the tenancy of the key wrong.

### Medium

None.

### Low / Hardening

**S-L1 — `PUT /api/spaces/{id}/fields` dropped the request-size limit, and `ColumnLabels` has no bound**

`SpacesController.cs:56-58`, `SpaceFieldsDtoValidator.cs:13-17`, `SpaceFieldsDto.cs:22`,
`TidansuDbContext.cs:65`.

The retired `PUT /api/spaces/{id}` carried `[RequestSizeLimit(24 * 1024 * 1024)]`; the
replacement `PUT /api/spaces/{id}/fields` carries **none**, so it falls back to Kestrel's
~28.6 MB default — a slightly *larger* ceiling than the endpoint it replaces. Meanwhile
`SpaceFieldsDtoValidator` bounds `Name`/`Type`/`ViewMode`/`CanvasMode` but says nothing about
`ColumnLabels` (`List<string>?` → EF primitive collection → JSON in an unbounded column) or
`LayoutColumns` (`int`, no range). An authenticated Free user can therefore park ~28 MB of
JSON per space, rewrite it at will for free, and have it re-inflate on every
`GET /api/spaces` boot hydrate.

This is **not** a regression B-15 introduced — `SpaceDtoValidator` has no `ColumnLabels` rule
either, so `POST /api/spaces` has always accepted this. B-15 just adds a cheaper, repeatable
surface for it. Hardening, not a live break.

**Fix:** add `[RequestSizeLimit(...)]` to the fields route (something small — the body is six
scalars; 64 KB is generous), and add
`RuleFor(s => s.ColumnLabels).Must(l => l is null || l.Count <= N)` plus
`RuleForEach(s => s.ColumnLabels).MaximumLength(120)` and an
`InclusiveBetween` on `LayoutColumns`, mirrored into `SpaceDtoValidator` so the two paths
don't drift.

**S-L2 — D-3's comment documents one exception; there are now two**

`SpacesRepository.cs:126-131` and `:338-343` describe `RemoveZoneWithItemsAsync` as "the one
place in this file that reaches an entity without repeating the (spaceId, userId) ownership
filter inline". Since the set-based `RemoveItemAsync` rewrite (`:362-369`) that is no longer
true — there are two, and the new one is the more subtle of the pair (its safety lives
entirely inside an EXISTS subquery). Both are safe today. Purely a comment-accuracy issue,
but D-3's whole value is that a reader can trust the invariant without re-deriving it, so a
stale exception list erodes the control. **Fix:** update the D-3 comment to name both.

## Verification checklist

- [ ] **S-H1 (squatting):** as user A, `POST /api/spaces/{A-space}/zones` with
      `{"id": "zone_1abc", ...}` → 200. As user B, `POST /api/spaces/{B-space}/zones` with
      the **same** `"id": "zone_1abc"` → currently **500**. After the fix it must be **200**
      (per-space key / server-minted id) or at worst a **409**, and B's zone must persist.
- [ ] **S-H1 (oracle):** confirm a colliding id no longer returns a status distinguishable
      from a non-colliding one on someone else's key.
- [ ] **S-H1 (no regression):** after any key/migration change, re-run the zone-delete
      cascade — `RemoveZoneWithItemsAsync`'s `ExecuteDeleteAsync` predicate must still
      resolve correctly under a composite key.
- [ ] **S-L1:** `PUT /api/spaces/{id}/fields` with a 20 MB `columnLabels` array → must be
      **413** or **400**, not 200; confirm nothing was persisted.
- [ ] **Regression guard (already passing — keep passing):** cross-user `PUT /api/spaces/{A}/items/{B-item}`
      → 404 with the same body shape as an unknown id; Free user `POST .../items` with a
      photo → 403 `{plan:["photos"]}` (never a 400); Free user at 6/6 zones firing 10
      concurrent `POST .../zones` → final count exactly 6, rejections are 403 `zones` and
      never 500.
