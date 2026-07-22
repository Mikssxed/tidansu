# B-24 · Technical Tasks — Server-side read-only enforcement of over-cap spaces

Server half of "downgrade keeps data but makes over-cap content read-only". B-17
disables the affordances in the SPA; the API still accepts the mutations. This
adds one new authorization boundary — the **whole-space over-cap gate** — to every
content-mutating Spaces handler, reusing **one** shared definition, and leaves
whole-space DELETE (the recovery path) untouched.

## Design decisions (read before starting)

- **The over-cap definition, in one place, three seams.** The rule "is this whole
  space one of the account's excess spaces?" decomposes into:
  1. a **pure Domain rule** — `PlanPolicy.CheckSpaceContentMutation(plan, precedingSpaceCount)`
     (mirrors `CheckAddZone`'s `count >= cap` shape; table-tested);
  2. an **owner-scoped rank query** — `ISpacesRepository.CountSpacesOrderedBeforeAsync`
     (the space's 0-based position in the account's stable `OrderBy(Id)` order,
     computed in SQL so its collation matches `GetSpaceSummariesPageAsync`);
  3. a **shared Application guard** — `SpaceOverCapGuard.EnsureSpaceContentWritableAsync(spaceId, userId, ct)`
     that resolves the plan, short-circuits for Pro, runs the rank query for Free,
     and throws `PlanLimitException("spaces")`. Every handler calls this ONE method.
- **Over-cap = `precedingSpaceCount >= caps.spaces`.** Position in `OrderBy(s => s.Id)`
  ascending; positions `0..cap-1` are under-cap, `>= cap` are over-cap. The target
  space's position equals the count of the account's spaces whose `Id` sorts before
  it — a single `COUNT(*)`, not a graph load. This is the **identical** rule the SPA
  uses to badge (B-17), consuming the same `PlanCaps.For(plan).Spaces` value the
  space-creation gate and the dashboard listing use. Do **not** invent a second
  definition.
- **This gate is orthogonal to the per-space zone/item COUNT caps.** `CheckAddZone`/
  `CheckAddItem` ask "does this space have too many zones/items?" and are deliberately
  un-gated on update/delete (the D-1 decomposition in `PlanPolicy.cs`). B-24 asks a
  different question — "is the *whole space* one of the account's excess spaces?" —
  and it **does** gate updates and deletes of the space's contents, because an over-cap
  space is read-only in full. Keep the two checks separate; do not merge or reorder
  them into each other. An under-cap Free space with 8/6 zones stays editable.
- **Invariant order in every handler (unchanged shape):** (1) owner-scoped 404 →
  (2) over-cap 403 (new) → (3) existing plan gates / atomic cap → (4) mutation. The
  new gate slots into step 2, always **after** the space is confirmed owned and
  **after** any not-found sub-resource check, **before** any mutation.

---

## 1. 📋 Technical Tasks

### Backend — Domain

- [x] add `CheckSpaceContentMutation(Plan plan, int precedingSpaceCount)` to `src/Tidansu.Domain/Constants/PlanPolicy.cs`
  - Mirror the shape of the existing `CheckAddZone` (same file): `if (caps.Spaces is int cap && precedingSpaceCount >= cap) return PlanLimitReasons.Spaces; return null;`. Pro's `caps.Spaces` is null → never fires.
  - Add a heavy comment distinguishing it from `CheckAddZone`/`CheckAddItem`: this is the **whole-space** over-cap question, it **does** gate update/delete of contents (unlike the per-space COUNT caps), and `precedingSpaceCount` is the target's 0-based rank in `OrderBy(Id)`. Cross-reference the deliberate D-1 "updates/deletes are not gated" comment so a future reader does not conflate the two.
  - ⚠️ Do **not** add `CheckUpdate*`/`CheckDelete*` for the zone/item COUNT caps — that absence is load-bearing (see the existing D-1 comment). This new method is about the space's *position*, not any child count.

- [x] add table tests for `CheckSpaceContentMutation` to `tests/Tidansu.Domain.Tests/PlanPolicyTests.cs`
  - Mirror the `CheckAddZone_returns_expected` `[Theory]` block: `(Free, 0, null)`, `(Free, 1, null)`, `(Free, 2, PlanLimitReasons.Spaces)`, `(Free, 3, PlanLimitReasons.Spaces)`, `(Pro, 999, null)`. Free cap is 2 (pinned by `Free_caps_match_the_shipped_limits`).
  - 🔒 blocked by: `CheckSpaceContentMutation` added.

- [x] add `CountSpacesOrderedBeforeAsync(string spaceId, string userId, CancellationToken)` returning `Task<int>` to `src/Tidansu.Domain/Repositories/ISpacesRepository.cs`
  - XML doc it in the style of the neighbouring `CountZonesAsync`: "The owner-scoped count of the user's spaces whose stable `Id` key sorts before `spaceId` — i.e. the target's 0-based rank in the same `OrderBy(Id)` order `GetSpaceSummariesPageAsync` pages by. A `SELECT COUNT(*)`, never a graph load. Assumes the caller has already owner-verified the space (404 precedence)."

### Backend — Infrastructure

- [x] implement `CountSpacesOrderedBeforeAsync` in `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs`
  - `dbContext.Spaces.Where(s => s.UserId == userId && string.Compare(s.Id, spaceId) < 0).CountAsync(ct)` — projects to a SQL `COUNT(*)`; no zone/item/photo column leaves SQL (same discipline as `CountZonesAsync`).
  - ⚠️ **Collation parity (correctness-critical).** The rank MUST be computed in SQL with the same string comparison the summaries query orders by. Use `string.Compare(s.Id, spaceId) < 0` (EF translates to a relational `WHERE Id < @spaceId` under the column's collation) — the same collation `GetSpaceSummariesPageAsync`'s `OrderBy(s => s.Id)` uses. Do **not** load ids and compare in memory with `string.CompareOrdinal` / a C# sort — ordinal C# ordering can diverge from SQL Server's default collation and silently pick a *different* over-cap set than the SPA badges, which is exactly the parity bug this item exists to avoid.
  - No `AsNoTracking` needed (`CountAsync` tracks nothing). No `.Include`.
  - ⚠️ **No EF migration** — this adds only a read query; no entity field or `TidansuDbContext` model change.

### Backend — Application

- [x] create the shared guard `src/Tidansu.Application/Spaces/SpaceOverCapGuard.cs`
  - Injectable class `SpaceOverCapGuard(IUserService userService, ISpacesRepository spaces)` with one method `EnsureSpaceContentWritableAsync(string spaceId, string userId, CancellationToken ct)`:
    1. `var user = await userService.FindByIdAsync(userId, ct) ?? throw new AuthenticationException("user not found");`
    2. `if (PlanCaps.For(user.Plan).Spaces is not int) return;` — Pro short-circuit, skips the rank query entirely (mirrors `AddZoneCommandHandler`'s `zoneCap is int cap` branch).
    3. `var preceding = await spaces.CountSpacesOrderedBeforeAsync(spaceId, userId, ct);`
    4. `if (PlanPolicy.CheckSpaceContentMutation(user.Plan, preceding) is { } reason) throw new PlanLimitException(reason);`
  - Document that it **assumes the caller has already owner-scoped-resolved `spaceId`** (so a non-owned space 404s in the handler before this runs — never a 403 that reveals over-cap status of a space that is not the caller's).
  - This is the single definition every handler reuses. Do not inline the rank/plan logic anywhere else.
  - ⚠️ Reason precedence: this guard reports `spaces` **before** the handler's own count/photo gates run (see per-handler placement below), so an over-cap space returns `{plan:['spaces']}` even when its zone/item counts would also fire — because the whole space is frozen, `spaces` is the accurate remedy (get under cap or upgrade). See Open Question 1.

- [x] register `SpaceOverCapGuard` in `src/Tidansu.Application/Extensions/ServiceCollectionExtensions.cs`
  - `services.AddScoped<SpaceOverCapGuard>();` alongside the existing `AddScoped<IUserContext, UserContext>()`. (Concrete type, no interface needed — it is an internal Application collaborator, not a Domain seam.)
  - 🔒 blocked by: `SpaceOverCapGuard.cs` created.

- [x] gate space update in `src/Tidansu.Application/Spaces/Commands/UpdateSpaceFields/UpdateSpaceFieldsCommandHandler.cs` (FR-2)
  - Inject `SpaceOverCapGuard`. After the existing `GetByIdWithoutContentAsync ?? throw NotFoundException` (owner-scoped 404), before mutating `existing`, call `await guard.EnsureSpaceContentWritableAsync(request.Id, userId, cancellationToken);`.
  - Keep the existing comment about *not* adding a per-space count gate here — that stays true; this is the orthogonal whole-space gate.
  - 🔒 blocked by: guard registered.

- [x] gate zone add in `src/Tidansu.Application/Spaces/Commands/AddZone/AddZoneCommandHandler.cs` (FR-3)
  - After the `CountZonesAsync ?? throw NotFoundException` (owner-scoped 404), **before** `PlanPolicy.CheckAddZone`, call the guard. Placing it before `CheckAddZone` makes `spaces` the reported reason when both would fire.
  - 🔒 blocked by: guard registered.

- [x] gate item add in `src/Tidansu.Application/Spaces/Commands/AddItem/AddItemCommandHandler.cs` (FR-3)
  - After the `CountItemsAsync ?? throw NotFoundException` (space 404) **and** the `ZoneExistsInSpaceAsync ?? throw NotFoundException("Zone")` (referenced-zone 404 — a not-found that must keep precedence, FR-3), and **before** `PlanPolicy.CheckAddItem`, call the guard. (Both not-found checks stay ahead of the over-cap 403.)
  - 🔒 blocked by: guard registered.

- [x] gate zone update in `src/Tidansu.Application/Spaces/Commands/UpdateZone/UpdateZoneCommandHandler.cs` (FR-3)
  - Inject `SpaceOverCapGuard`. After `GetZoneAsync ?? throw NotFoundException` (owner-scoped 404), before mutating `zone`, call the guard.
  - Keep the existing "no per-zone count gate here" comment — still true; this is the orthogonal gate.
  - 🔒 blocked by: guard registered.

- [x] gate item update in `src/Tidansu.Application/Spaces/Commands/UpdateItem/UpdateItemCommandHandler.cs` (FR-3)
  - After `GetItemAsync ?? throw NotFoundException` (404) and the zone-reassign `ZoneExistsInSpaceAsync ?? throw NotFoundException("Zone")` (not-found precedence), and **before** the photo gate (`PlanPolicy.CheckItemPhotoChange`), call the guard.
  - ⚠️ Over-cap wins over the photo 403 here (guard runs first): a Free user editing an item in an over-cap space gets `{plan:['spaces']}`, not `{plan:['photos']}`. That is the accurate remedy for a frozen space. See Open Question 1.
  - 🔒 blocked by: guard registered.

- [x] gate zone removal in `src/Tidansu.Application/Spaces/Commands/RemoveZone/RemoveZoneCommandHandler.cs` (FR-4)
  - Today the 404 is determined *inside* `RemoveZoneWithItemsAsync` (returns false). Add an explicit **owner-scoped** existence pre-check first so not-found precedence and the "no over-cap oracle on non-owned spaces" rule both hold: `if (!await spaces.ZoneExistsInSpaceAsync(request.SpaceId, request.ZoneId, userId, ct)) throw new NotFoundException("Zone", request.ZoneId);`. Then `await guard.EnsureSpaceContentWritableAsync(request.SpaceId, userId, ct);`. Then the existing `RemoveZoneWithItemsAsync` call (its own false→404 stays as the concurrent-delete backstop).
  - Inject `SpaceOverCapGuard` (`spaces` is already injected).
  - 🔒 blocked by: guard registered.

- [x] gate item removal in `src/Tidansu.Application/Spaces/Commands/RemoveItem/RemoveItemCommandHandler.cs` (FR-4)
  - Same shape as RemoveZone: add `if (!await spaces.ItemExistsInSpaceAsync(request.SpaceId, request.ItemId, userId, ct)) throw new NotFoundException("Item", request.ItemId);` first, then the guard, then the existing `RemoveItemAsync` call (its false→404 stays).
  - Inject `SpaceOverCapGuard`.
  - 🔒 blocked by: guard registered.

- [x] confirm `src/Tidansu.Application/Spaces/Commands/DeleteSpace/DeleteSpaceCommandHandler.cs` is **untouched** (FR-5)
  - Whole-space delete is the recovery path back under the cap and must never be gated by this item. This is an explicit *do-not-edit* checkpoint, not a code change — verify no guard call was added here during review.

### Backend — API

- [x] No controller/route/DTO change. The endpoints' signatures are unchanged; they merely start returning the existing `403 {plan:['spaces']}` (already produced by `ErrorHandlingMiddleware`'s `PlanLimitException` branch) in the over-cap case. The `[ProducesResponseType(403)]` attributes already present on `SpacesController`/`SpaceZonesController`/`SpaceItemsController` remain accurate.

### Frontend — API client / Composables / Components

- [x] **No Kiota regeneration and no frontend code change required.** No request/response contract, controller signature, or route changed, so `src/api/apiClient/` is unaffected. The SPA already interprets `403 {plan:[reason]}` with `reason: 'spaces'` (paywall) and B-17 already disables these affordances for over-cap spaces, so a well-behaved client never reaches the new 403. See Open Question 2 for the cross-tab-downgrade race and the verification note below.

### Refactoring

- [ ] `[refactor]` (optional, scoped) In `SpaceOverCapGuard`, consider an overload taking an already-resolved `Plan` so `AddZoneCommandHandler`, `AddItemCommandHandler`, and `UpdateItemCommandHandler` — which already load `user` for their photo/count gates — do not load the user a second time. Only worth doing if a reviewer objects to the double PK lookup; the single-method form keeps every call site identical, which is the higher-value property. If skipped, note the accepted cost in the guard's comment.
- [x] No other refactoring needed in touched files. The guard *is* the DRY consolidation; the four remove/update handlers gaining a guard call and (for removes) an explicit existence pre-check are additive and follow the established invariant order.

### Verification

- [x] `dotnet build` of the solution is green.
- [x] `dotnet test tests/Tidansu.Domain.Tests` is green (new `CheckSpaceContentMutation` rows pass).
- [x] Manual end-to-end drive against the running API (`dotnet run` from `src/Tidansu.API`), a Free-plan user with **5 spaces created in order S1..S5** (`caps.spaces = 2`, so S1/S2 under-cap, S3/S4/S5 over-cap). Call the endpoints **directly** (bypassing the SPA):
  - **Happy / under-cap path:** update S1's fields; add/update/remove a zone and an item in S1 → each returns success and the data changes.
  - **Over-cap read-only path:** the same six operations against **S3** → each returns `403` with body `{"errors":{"plan":["spaces"]}}` and **no data changes** (re-read to confirm the stored settings/zone/item are unchanged).
  - **Recovery path:** `DELETE` S3 → succeeds; then repeat an update against **S4** — it now evaluates as under-cap (rank dropped) and **succeeds on the very next request**, no separate unlock step (FR-1/FR-5).
  - **Pro unaffected:** upgrade the user to Pro (or use a Pro account) → all six operations against every space succeed (guard short-circuits, no rank query).
  - **Not-found precedence:** call any gated endpoint with a space id the user does not own → `404`, never `403` (no over-cap oracle).
- [x] Frontend smoke (no code changed): with B-17 in place, badge an over-cap space read-only in the SPA and confirm the disabled affordances match exactly which spaces the API now blocks — server and SPA must agree on the same over-cap set.

---

## 2. 🔒 Security Considerations

- 🔴 **Critical — the closed access-control gap must not reopen via ordering.** The whole point is that a downgraded Free user with a valid JWT can no longer mutate over-cap content by calling endpoints directly. Every gated handler must call the guard **before its mutation** and the guard must actually throw for over-cap Free spaces.
  - [ ] Verified: each of the six handlers calls `EnsureSpaceContentWritableAsync` on the request's space id before any `SaveChangesAsync`/insert/remove, and the over-cap drive above returns 403 for all six.
- 🔴 **Critical — no over-cap oracle on non-owned spaces (IDOR).** The guard must only ever run against a space the caller has already been confirmed to own; otherwise a Free user could probe another account's space ids and learn "over-cap" (403) vs "not found" (404). The remove handlers are the risk: their 404 was previously determined *inside* the repo delete.
  - [ ] Verified: RemoveZone/RemoveItem perform the owner-scoped `*ExistsInSpaceAsync` 404 pre-check *before* the guard; the guard's own rank query is `WHERE UserId == userId`; a non-owned id yields 404 in every handler.
- 🟠 **High — SPA/server parity.** If the server blocks a *different* over-cap set than the SPA badges (collation drift between the rank query and `OrderBy(Id)`), the product looks broken — a badged-read-only space edits fine, or vice versa.
  - [ ] Mitigation: rank computed in SQL via `string.Compare(s.Id, spaceId) < 0` under the same column collation as `GetSpaceSummariesPageAsync`; verified by the frontend smoke step.
- 🟠 **High — delete must stay ungated.** A stray guard call on the delete path would trap a downgraded user with no in-product way back under the cap, contradicting the product promise.
  - [ ] Mitigation: `DeleteSpaceCommandHandler` explicitly left untouched; over-cap delete verified successful in the drive.
- 🟡 **Medium — no distinct logging of bypass attempts (resolved: out of scope).** Per the human gate, no special logging beyond the existing `ErrorHandlingMiddleware` `LogInformation("Plan limit hit: {Reason}")`. Accepted; a deliberate-abuse-pattern monitor is a separate later concern.

## 3. 📈 Scalability / Correctness Considerations

- **Extra query per Free content mutation.** Each gated mutation now runs one additional owner-scoped `COUNT(*)` (skipped entirely for Pro via the `caps.Spaces is not int` short-circuit). It is an indexed count over the user's spaces, not a graph load, on the write path (not a hot read path).
  - [ ] Mitigation: confirm the query materialises as `SELECT COUNT(*) FROM Spaces WHERE UserId = @u AND Id < @s` (check the dev EF SQL log), not a load-then-count. Rely on the existing `UserId` index; the row count per user is tiny.
- **Double user load on three handlers.** `AddZone`/`AddItem`/`UpdateItem` load `user` for their own gates and again inside the guard — two PK lookups on a write path.
  - [ ] Accept as negligible, or apply the optional `Plan`-overload refactor above.
- **Live, uncached evaluation (FR-1).** Rank is recomputed every request, so deleting a space or upgrading restores editability on the very next call with no unlock step. A concurrent space delete between a handler's 404 check and the guard only shifts ranks; the mutation itself still 404s/behaves correctly, so no correctness gap.
  - [ ] Verified by the recovery-path drive (delete S3 → S4 immediately editable).

## 4. 📦 New Dependencies

No new dependencies required.

## 5. ❓ Open Questions

1. **Reason precedence when the over-cap gate and a child count/photo cap both apply.** This plan reports `spaces` first (guard runs before `CheckAddZone`/`CheckAddItem`/the photo gate), on the reasoning that a frozen over-cap space's true remedy is "get under the cap or upgrade," not "you have too many items / photos are Pro-only." Confirm the PO wants `spaces` to win the paywall in these overlap cases. (Low risk to reverse — it is purely the ordering of the guard call within each handler.)
2. **Cross-tab / cross-device downgrade race on the SPA.** Because B-17 disables the affordances, a normal client never hits the new 403 — *except* if a user downgrades in one tab while another still shows the space as editable. In that window the SPA's update/remove composables would receive a surprise `403 {plan:['spaces']}`. FR-6 asserts no new SPA error handling is needed (same error family the paywall already renders); confirm the existing paywall/B-19 generic-failure toast surfaces this gracefully rather than silently swallowing it. No frontend code is planned for it in this item.
3. **Resolved at the human gate (recorded for traceability):** zone/item *removal* inside an over-cap space **is** in scope and rejected (FR-4); **no** special logging of bypass attempts; **no** grace period after downgrade — the rule is live immediately on every request.
</content>
</invoke>
