# Tidansu — Security Review

**Date:** 2026-07-21
**Scope:** B-22 (`scoped-zone-item-keys`) — uncommitted working-tree changes on `main`.
Files audited in full: `TidansuDbContext.cs`, `20260721171615_ScopeZoneItemKeysToSpace.cs`,
`TidansuDbContextModelSnapshot.cs`, `SpacesRepository.cs`, `ISpacesRepository.cs`,
`ErrorHandlingMiddleware.cs`, `SpaceDtoValidator.cs`, `SpaceCollectionCaps.cs`,
`AddZoneCommandHandler.cs`, `AddItemCommandHandler.cs`. Plus the surrounding trust
plumbing not in the diff but load-bearing on it: `SpaceDto/ZoneDto/ItemDto` `ToEntity`,
`UpdateZone/UpdateItemCommandHandler`, `CreateSpaceCommandHandler`, all
`Spaces/Commands/*Validator.cs`, `ItemDtoValidator`, `ApiOperationResult`,
`SpacesController`, `NotFoundException`.
**Type:** Findings report only — no code changes made.
**Lane:** trust boundaries, tenant isolation, information leakage, fail-open behaviour.
Correctness / convention / scope creep are the parallel `branch-code-reviewer`'s.

**Overall:** The central risk of this task — that owner-scoping which was *accidentally*
safe under a globally-unique key becomes load-bearing under a composite one — is
handled. I independently re-derived every query that reaches `Zone` or `Item`
(not just the ones in `SpacesRepository`, and not trusting the prior dispatch's
audit) and all of them are explicitly space- and owner-correlated; there is no
reachable cross-tenant read, mutate or delete. The existence oracle for zones and
items is genuinely closed, structurally rather than by masking. **However, the
identical bug that motivated this whole task is still fully open one level up:
`Space.Id` remains a client-supplied, globally-unique primary key with no
pre-check, so the cross-tenant DoS and the 200-vs-500 existence oracle survive
intact for spaces — and the new `DbUpdateException` clause does not close it,
despite a comment that reads as though persistence collisions now leak nothing.**
That is the one finding here with real cross-tenant impact.

## What's already done right

Verified by tracing, not by reading the comments (the comments in this repo are
accurate, which makes them tempting to trust — these are the ones I took to ground):

- **Tenant isolation is now structural for `Zone`/`Item`.** A repo-wide grep for
  `Set<Item>` / `Set<Zone>` / `.Zones` / `.Items` / `FindAsync` / `Entry(` confirms
  these entities are reached in exactly one place — `SpacesRepository.cs` — plus
  their `TidansuDbContext` mapping. There is no second access path (no controller,
  handler, service or query object touches them directly), so the audit surface is
  genuinely one file.
- **Every one of those queries is space+owner correlated.** `GetZoneAsync:269`,
  `GetItemAsync:276`, `ZoneExistsInSpaceAsync:282`, the new `ItemExistsInSpaceAsync:290`,
  `CountZonesAsync:253`, `CountItemsAsync:259`, `GetLayoutByIdAsync:68` and
  `GetByIdAsync:14` all root at
  `dbContext.Spaces.Where(s => s.Id == spaceId && s.UserId == userId)` and reach the
  child through `s.Zones` / `s.Items`, which EF joins on `SpaceId`. The trailing
  `z.Id == zoneId` / `i.Id == itemId` is therefore a *filter within an already
  owner-restricted set*, not a bare lookup — exactly the inversion this task needed
  to survive. Confirmed independently of the prior dispatch's claim.
- **`RemoveItemAsync:443` refactor is correct and necessary.** The old
  `Where(i => i.Id == itemId && Spaces.Any(s => s.Id == spaceId && s.Id == i.SpaceId && s.UserId == userId))`
  was safe only transitively. The new form states `i.SpaceId == spaceId` as its own
  conjunct plus the ownership `EXISTS`. Both a cross-user id and a cross-*space* id
  (a real id in another space of the *same* user) now affect 0 rows → `false` → the
  same 404. No divergence.
- **`RemoveZoneWithItemsAsync:395` is the only entity reached without an inline
  `(spaceId, userId)` filter, and it is safe.** `zone` comes from the owner-scoped
  `GetZoneAsync` one line above, so `zone.SpaceId` is already owner-verified; the
  item cascade at `:417` is `i.SpaceId == zone.SpaceId && i.ZoneId == zoneId`, i.e.
  space-scoped even though `Item.ZoneId` carries no FK. `Set<Zone>().Remove(zone)`
  now deletes by the composite `(SpaceId, Id)`, which is strictly narrower than
  before. The "if a second such place appears, D-3 has stopped being structural"
  tripwire comment is accurate as edited.
- **No key column is client-mutable after creation.** `UpdateZoneCommandHandler:28-43`
  and `UpdateItemCommandHandler:72-81` assign only non-key fields — neither ever
  writes `Id` or `SpaceId`. Moving a row into another tenant's space is not
  expressible through any endpoint (the space is the route, and the route id is
  owner-checked before the entity is resolved).
- **The zone/item existence oracle is closed by construction, not by masking.** With
  `(SpaceId, Id)`, a colliding id from another tenant now simply *succeeds* (200) —
  there is no longer a signal to leak. The `DbUpdateException` clause is belt-and-
  braces on top of that, and it is only reachable from the caller's own space
  (S-L1), so it can only ever reveal information the caller already has.
- **The `DbUpdateException` response is byte-identical to the generic 500 — confirmed,
  and the prior dispatch's caveat hides nothing.** `ErrorHandlingMiddleware.cs:197-209`
  vs `:215-227`: same `StatusCodes.Status500InternalServerError`, same
  `ContentType = "application/json"`, same `ApiOperationResult` shape with the same
  `GeneralErrorKey` and the same literal `"Something went wrong."`, serialized by
  the same `WriteAsJsonAsync` call. `ApiOperationResult` (`Models/ApiOperationResult.cs:6-12`)
  carries only `Errors` and `IsSuccess` — **no traceId, no timestamp, no correlation
  id** — so there is no per-request-varying field that could differ between the two
  branches, and Content-Length is therefore also identical. The prior dispatch was
  right to compare at source rather than byte-diff a body that echoes the caller's
  own id; the echo is in the *success* body, not in either 500 body. Both 500s are
  literally `{"errors":{"general":["Something went wrong."]},"isSuccess":false}`.
  `DbUpdateConcurrencyException` inherits from `DbUpdateException` and lands in the
  same clause, which is the correct outcome.
- **`ex.Message` / `ex.InnerException.Message` never reach the body.** The clause logs
  the exception server-side and constructs a fresh generic payload. This matters:
  SQL Server's 2627 duplicate-key text embeds the colliding key value verbatim, and
  under the *old* single-column key that value was another tenant's zone id. Correctly
  handled.
- **`NotFoundException` at `:44` is safe — I overturn nothing.** `NotFoundException`
  (`Domain/Exceptions/NotFoundException.cs:3`) formats
  `"{resourceType} with id: {resourceIdentifier} doesn't exist."`. I enumerated every
  throw site under `Spaces/`: `AddZone:27,67,74`, `AddItem:29,34,81,88`,
  `UpdateZone:22`, `UpdateItem:27,37`. In every case the identifier is a value the
  caller supplied in that same request — a route segment (`request.SpaceId`,
  `request.ZoneId`, `request.ItemId`) or a body field (`dto.ZoneId`). None is read
  from the database. It is pure self-reflection, and it is JSON-escaped by
  `WriteAsJsonAsync` under `application/json`, so no injection/response-splitting
  either. No other exception type in the middleware reflects a message: `ForbidException`,
  `AuthenticationException`, `BadHttpRequestException`, `BillingUnavailableException`,
  `EmailDeliveryException` and both 500 branches all emit fixed literals; only
  `ValidationException` passes through structured errors, all authored in-repo.
- **404/403 non-divergence still holds.** There is no `ForbidException` anywhere under
  `Spaces/`; "unknown id" and "another user's id" share one `null`/`false` → 404
  branch in every handler. An attacker cannot distinguish them.
- **The new caps are fail-closed and cannot be reordered around.** `DependentRules`
  (`SpaceDtoValidator.cs:31,48`) makes the count check a *precondition* of the
  per-element and duplicate-id rules rather than a declaration-order accident, so an
  oversized payload is rejected before `ZoneDtoValidator` runs 120,000 times.
  Exceeding a cap produces a `ValidationException` → 400, never a 500 and never a
  `PlanLimitException` — correct, because `SpaceCollectionCaps` is a request-size
  bound, not a plan gate. `SpaceDtoValidator` is reachable only from
  `CreateSpaceCommandValidator`, and since B-15 split the whole-space `PUT` there is
  no other endpoint that accepts a zone/item *collection* — so the cap covers the
  entire collection-bearing surface. At 500/5,000 it sits ~83×/100× above the Free
  per-space caps (6/50), so it can never preempt the `zones`/`items` paywall.
- **Intra-request duplicate ids are now a clean 400.** Without the new
  `HasNoDuplicateIds` rules, two same-id zones in one `POST` would have thrown an EF
  change-tracker `InvalidOperationException` during graph build — a 500 that this
  task's own FR-3 forbids. Correctly caught in the validator, i.e. before any
  persistence attempt.
- **No auth/ownership bypass in the new pre-checks, and their ordering preserves the
  paywall.** `AddZoneCommandHandler:43` runs the duplicate check *after* the
  owner-scoped `CountZonesAsync` 404 gate (`:26`) and *after* `CheckAddZone`'s 403
  (`:32`); `AddItemCommandHandler:57` runs *after* the 404 (`:28`), the zone
  referential 404 (`:33`), the plan 403 (`:42`) and `SpacePhotoGuard` (`:47`). So an
  unowned space id still 404s before the pre-check can execute, a Free user at cap
  still gets `403 {"plan":["zones"|"items"]}` rather than a 400, and a Free user
  sending a photo still gets `403 {"plan":["photos"]}` rather than the guard's 400.
  Both new checks use owner-scoped repository methods, so neither can observe a row
  outside the caller's own space — no new oracle.
- **The migration cannot fail on data and rolls back cleanly.** `(Id)` was already
  unique table-wide, so `(SpaceId, Id)` is unique *a fortiori*; `ADD PRIMARY KEY`
  cannot hit a duplicate. `suppressTransaction` is not set, so EF's default
  per-migration transaction gives the settled all-or-nothing/fail-loud posture. The
  `Spaces` FKs are untouched (the `SpaceId` column itself is unchanged), so the
  `ON DELETE CASCADE` that cleans up a deleted space's content is preserved — no
  orphan-row path opens.
- **No raw SQL takes a zone or item id.** The only raw SQL is the `sp_getapplock`
  batch (`SpacesRepository.cs:198-201`), whose `@Resource` is a SHA-256 hex digest of
  a space or user id (`HashForLock:166`), interpolated as an EF-parameterized
  `FormattableString`. No injection surface, and the fixed 64-char width means two
  ids cannot truncate onto one lock resource.

## Security findings

### Critical

None. Nothing in this diff exposes another tenant's data, bypasses a plan cap, or
bypasses authentication.

### High

**S-H1 — `Space.Id` is still a client-supplied, globally-unique primary key: the exact
cross-tenant DoS and existence oracle B-22 exists to kill remain open one level up,
and the new middleware clause does not close them.**

`src/Tidansu.Infrastructure/Persistence/TidansuDbContext.cs:57-83` — `Entity<Space>`
receives no `HasKey`, so EF's convention puts the PK on `Space.Id` alone
(`TidansuDbContextModelSnapshot.cs` still shows a single-column `b.HasKey("Id")` for
`Space`, in contrast to the new `b.HasKey("SpaceId", "Id")` at `:211` for `Item` and
the matching one for `Zone`). That id is taken verbatim from the client:
`SpaceDto.Id` → `SpaceDto.ToEntity:32`. It is generated by the same clock-derived
generator this task's brief indicts — `src/Tidansu.App/src/data/spaces.ts:39-41`
`uid()`, called as `uid('space')` at `useSpacesStore.ts:662`, `onboarding.ts:60` and
`seed.ts:57` — a per-page-load counter plus the low 3 base36 digits of `Date.now()`,
i.e. **46,656 reachable suffixes per counter value**.

Exploit path, concretely:

1. Attacker holds a **Pro** account. `PlanCaps.For(Pro).Spaces` is `null`, so
   `CreateSpaceCommandHandler:56-60` takes the unlimited branch — **no space cap at
   all**, and `SpacesController` has no rate limiter (rate limiting exists only on
   `AuthController` and `BillingController`).
2. Attacker `POST /api/spaces` 46,656 times with `id: "space_1aaa" … "space_1zzz"` —
   the entire suffix space for counter value `1`, which is what *every* victim's
   first space creation after a page load uses. Each body is a few hundred bytes with
   empty `zones`/`items`, so the new `SpaceCollectionCaps` and the 24 MB
   `RequestSizeLimit` do not bite.
3. Any other user then creates their first space. `CreateSpaceCommandHandler` performs
   **no existence pre-check on `dto.Id`** — it goes straight from the plan gate to
   `AddAsync:59` / `AddWithinSpaceCapAsync:48` → `SaveChangesAsync` → PK violation on
   `Spaces.Id` → `DbUpdateException`.
4. The victim gets a **500**, and reloading the page reproduces it (the counter resets
   to 1 on every load, so they re-draw from the squatted range). This is the
   verbatim symptom the B-22 brief describes — unchanged for spaces.
5. The same 200-vs-500 split is an **existence oracle**: any authenticated user can
   probe whether an arbitrary space id exists anywhere in the system, across tenants.

**The new `ErrorHandlingMiddleware.cs:184-210` clause does not mitigate this.** It
suppresses the exception *text* (good — SQL Server's 2627 message would otherwise
echo the colliding space id), but it emits the same 500 status, so the
200-vs-500 signal that *is* the oracle survives untouched. The clause's comment
frames the change as ensuring "a caller must not be able to distinguish this from any
other failure" — true within the 500 class, but the meaningful distinction here is
500-vs-200, and that remains. Combined with the task doc's claim that the oracle is
closed, a future reader will reasonably believe this class of bug is dead repo-wide
when it is dead only for `Zone` and `Item`. The `SpacesRepository.cs:231-239` comment
has the same blind spot.

I have deliberately **not** framed this as a scope violation — the settled decisions
cover Zone/Item id strategy only and say nothing about `Space`, and the parallel
reviewer owns scope. I am reporting it because the task's stated security goal
("one person's data can no longer collide with or reveal anything about another
person's", `task.md:26-27`) is not actually met at the account's top-level object, and
because this diff makes that gap harder to see rather than easier. It is the direct
descendant of B-15's 🟠 S-H1 and of the `client-supplied global PKs` entry in the
security-reviewer memory.

**Fix:** file a follow-up (this is a real slice, not a fold-in). Options, in order of
preference: (a) server-assign `Space.Id` — unlike zones/items there is **no
optimistic-add constraint forcing a client-known id at create time**, since the
create response already returns the full `SpaceDto` and the SPA has no pre-response
child rows to attach; (b) if the id must stay client-supplied, make the PK
`(UserId, Id)` — the exact composite pattern this task establishes, and the one that
keeps the fix structural; (c) at minimum, an owner-scoped existence pre-check plus a
`DbUpdateException`→400/409 mapping for `POST /api/spaces` so a collision is a clean
client error rather than a 500 — but note (c) does **not** close the oracle, it only
softens the DoS. Independently of which is chosen, add a rate limiter to
`SpacesController.CreateSpace`; unlimited unmetered space creation on Pro is what
makes step 2 cheap.

### Medium

**S-M1 — the new collection-cap rules re-open a null-collection NRE that the repo had
already decided to defend against explicitly.**

`src/Tidansu.Application/Spaces/Dtos/SpaceDtoValidator.cs:29` and `:46` —
`Must(zones => zones.Count <= …)` and `Must(items => items.Count <= …)` dereference
the collection unguarded. `SpaceDto.Zones`/`Items` are non-nullable `List<T>` with a
`= []` initializer, but System.Text.Json **overwrites** that initializer when the body
carries an explicit `"zones": null`, yielding a null property and a
`NullReferenceException` inside the validator → generic 500.

This is not a novel discovery for this codebase — `ItemDtoValidator.cs:50-57` documents
the identical hazard for `Tags`, notes that MVC's non-nullable-reference ModelState
check currently rejects the null first with a 400, states that this was *verified by
driving it with the rule removed*, and then adds `.Cascade(CascadeMode.Stop).NotNull()`
anyway with the explicit rationale: "This keeps the rule self-contained if that
implicit behaviour ever goes away." The new rules take the opposite bet on the same
hazard, in the same feature, three files away.

Reachability today is therefore **blocked by MVC's implicit check**, which is why this
is Medium and not High: I could not construct a request that reaches the NRE. But the
protection is a framework default that a `[JsonSerializable]`/nullable-context/
`SuppressImplicitRequiredAttributeForNonNullableReferenceTypes` change silently
removes, and it is not asserted anywhere in this feature's tests. Note also that
`CreateSpaceCommandHandler:30` (`dto.Zones.Count`) has the same shape, so the
underlying exposure predates this diff — but the diff adds two new dereference sites
without adopting the repo's own documented mitigation.

**Fix:** mirror the `Tags` precedent exactly —
`RuleFor(s => s.Zones).Cascade(CascadeMode.Stop).NotNull().Must(...)`, likewise for
`Items`. Two words per rule, and it makes the cap fail-closed on its own terms rather
than on a framework default.

### Low / Hardening

**S-L1 — the check-then-insert duplicate-id race is genuinely benign; confirming, with
the reasoning made explicit.**

`AddZoneCommandHandler.cs:43` / `AddItemCommandHandler.cs:57` pre-check, then insert.
The race is real and the in-code comments understate *why* it is not closed on the
Free path: `AddZoneWithinCapAsync:309` does hold a per-space `sp_getapplock`, but the
pre-check runs *outside* it and the locked section re-checks only the **count**, never
the id — so two concurrent same-id adds serialize on the lock and the second still
hits the constraint. The Pro path (`AddZoneAsync:375`) takes no lock at all. Outcome
in both cases: `DbUpdateException` → 500 via the new clause.

I rate this benign and agree with the decision not to lock, on three verified grounds:
(1) the composite key is a real backstop — the constraint holds, so the outcome is a
**failed** insert, never a duplicate or corrupted row (fail-closed); (2) both racing
requests are the **same authenticated user against their own space**, so the 500
carries no information they do not already hold, and no other tenant can induce it;
(3) the failed `SaveChangesAsync` inside `AddZoneWithinCapAsync` propagates out through
`await using var transaction`, which disposes → rolls back, and because the lock is
`@LockOwner='Transaction'` it is released with the rollback — **no lock is stranded**,
so this cannot be escalated into a lock-exhaustion DoS against the shared per-space
resource. That last point is what would have made it non-benign, and it holds.

**Optional hardening only:** the caller-facing symptom is a 500 for what is logically a
client-side duplicate. If that matters, map `DbUpdateException` to 409 *only when the
inner error is 2627/2601 and the entity is a Zone/Item*. Not required, and note it
would need care not to reintroduce a distinguishable status — the reason the current
clause is a flat 500 is precisely that.

**S-L2 — the reachability comments on the new middleware clause and on
`SpacesRepository.cs:231-239` are scoped to Zone/Item but read as repo-wide.** Given
S-H1, a reader of either comment will conclude that client-supplied-key collisions are
handled everywhere. Worth one clause in each ("…for `Zone`/`Item`; `Space.Id` is still
a single-column client-supplied key — see B-22 follow-up") so the residual is
discoverable from the code rather than only from this document.

## Verification checklist

- [ ] **S-H1 (DoS):** as user A (Pro), `POST /api/spaces` with `id: "space_1zzz"`. Then
      as user B (a different account), `POST /api/spaces` with the same `id`. Expect
      today: **500**. After the fix: either a 200 (server-assigned or `(UserId, Id)`
      composite) or a clean 4xx — never a 500, and never an outcome that differs from
      the same request with a never-used id.
- [ ] **S-H1 (oracle):** as a fresh account, `POST /api/spaces` twice — once with an id
      known to exist in another tenant, once with a random unused id. Confirm the two
      responses are indistinguishable in status, body and headers. This is the test
      that currently fails.
- [ ] **S-H1 (rate limit):** confirm `POST /api/spaces` is rate-limited, by issuing
      >N creates in the window from one Pro account and expecting 429.
- [ ] **S-M1:** `POST /api/spaces` with `{"id":"x","name":"n","type":"other","viewMode":"…","canvasMode":"…","layoutColumns":1,"zones":null,"items":[]}`.
      Expect **400**, not 500. Then re-run with the MVC implicit non-nullable check
      disabled (mirroring how the `Tags` rule was verified) and confirm it is still a
      400 once `.NotNull()` is added.
- [ ] **Tenant isolation regression (guards the whole task):** give user A and user B
      each a space, and create a zone with the *identical* id in both. Then, as A:
      `PUT`, `DELETE` and `GET` that zone id against **B's** space id in the route.
      Expect 404 on all three, and confirm B's row still exists afterwards. Repeat for
      items, and repeat with A's *own second space* as the wrong route id — that
      cross-space case is the one the old globally-unique key made unreachable and the
      composite key makes newly reachable.
- [ ] **Cascade delete:** with the same-id zones from the previous test in place,
      `DELETE` A's space and confirm B's identically-id'd zone and its items survive
      (the `ON DELETE CASCADE` now fires on a composite child key).
- [ ] **Caps fail-closed:** `POST /api/spaces` with 501 zones and, separately, 5,001
      items — expect a 400 naming the collection, on both Free and Pro, with nothing
      persisted. Then 500 zones + one duplicate id — expect a 400 ("duplicate ids"),
      not a 500.

## Guideline update

Appended one line to `.claude/context/patterns.md` § *Backend gotchas* recording the
convention this task establishes: an ownership predicate must be stated explicitly at
the query level and never left to follow from a key's global uniqueness. That
inversion — a query that was accidentally safe becoming unsafe when a key is
narrowed — is the durable, team-wide lesson of B-22 and was not captured anywhere in
`context/*.md`.
