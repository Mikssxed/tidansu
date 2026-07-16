# Code Review: B-15 · Granular space endpoints (uncommitted working tree)
**Date**: 2026-07-16
**Reviewer**: branch-code-reviewer agent
**Diff base**: `HEAD` (bf9e169) + untracked — the change is unstaged on `main`
**Files changed**: 22 tracked (+2373/−344) + ~30 new (six CQRS triplets, 2 controllers, `pendingChanges.ts`, tests)
**Scope**: correctness · convention · scope-creep · maintainability. Trust boundaries,
authz/ownership, fail-open, secret leakage and plan-gate *bypass* are the parallel
security review's; deferrals are noted inline in one line each and not analysed.

## Summary

This is strong work. The backend decomposition is faithful, the layering is clean, the
retired `ReplaceAsync`/`UpdateSpaceCommand`/`CheckSpaceMutation` are gone without a
single stale reference, and the D-1 derivation comment is the best artefact in the diff.
The plan-gate algebra, the two `PhotoChangeBetween` traps, and the B-12 lock caveats all
survive the port accurately.

The problems are all on the **client orchestration** side, which is exactly where T-34's
backend drive (curl + EF SQL log) could not reach. One of them is a genuine silent
data-loss path that the existing `vitest` suite does not cover, and one is a violation of
FR-11's own acceptance criterion hiding behind a test whose fixture is too empty to catch
it. Both are in `pendingChanges.ts` / `flush()` — the two modules the task itself flagged
as highest-risk.

---

## 🔴 Critical (must fix before merge)

### [C1] Phase 2 races item ops against zone deletes — an item moved out of a deleted zone is silently destroyed server-side

**File**: `src/Tidansu.App/src/stores/useSpacesStore.ts:228-242` (with
`src/Tidansu.App/src/data/pendingChanges.ts:204-206`)
**Category**: Correctness / data loss

**Description**
`takeFlushPlan` puts item add/update/delete **and** zone deletes into the same
`phase2` bucket, and `runPhase2` pushes both into a single `runSends`, i.e. one
`Promise.allSettled(sends.map(s => s.send()))`. Every request leaves the browser at once;
the server order is arbitrary.

`deleteZone` computes `itemsInZone` from **live, already-patched** entities:

```ts
// useSpacesStore.ts:499
const itemsInZone = space.items.filter((it) => it.zoneId === zoneId);
```

So an item moved *out* of the zone earlier in the same 400 ms window is correctly not
cascaded locally, and its pending `update` correctly survives into `phase2.items`. But
the server row still carries the **old** `zoneId` until that update lands.

Concrete failure — all inside one debounce window, both actions ordinary layout-editor
gestures:

1. `updateItem(space, 'A', { zoneId: 'Z2' })` — user drags item A from zone Z1 to Z2.
2. `deleteZone(space, 'Z1')` — user deletes the now-empty Z1.
3. Flush: `PUT /items/A` and `DELETE /zones/Z1` fire together.
4. **If the DELETE lands first** (~50/50): `RemoveZoneWithItemsAsync` runs
   `Where(i => i.SpaceId == zone.SpaceId && i.ZoneId == zoneId).ExecuteDeleteAsync()`
   — A's row still says `ZoneId = 'Z1'`, so **A is deleted**.
5. `PUT /items/A` then 404s → `recordFailure` → `applyRollback` restores A's snapshot,
   putting `A.zoneId` back to `'Z1'` — a zone that no longer exists locally either.
6. UI shows an orphaned A pointing at a dead zone. Reload: A is gone. The user never
   asked for A to be deleted and sees no error that says it was.

This is the *inverse* of the invariant the two-phase split was built for. The store's own
docstring (`useSpacesStore.ts:48-51`) justifies phase 2 with "item ops need their zone to
exist server-side first" — a rationale about zone **adds** that says nothing about zone
**deletes**, which need the opposite ordering.

**Recommendation**
Zone deletes must settle **after** item ops, not alongside them. Nothing requires the
reverse order: an item add into a zone deleted in the same window is already annihilated
by `stageZoneDelete`, and an item delete in that zone is dropped there too. Add a third
phase (cheapest correct fix, no `pendingChanges` API change needed):

```ts
async function runPhase2(spaceId, space, plan, failedZoneAdds): Promise<void> {
    const itemSends: PendingSend[] = [];
    for (const op of plan.phase2.items) { /* … unchanged drop rule … */ }
    await runSends(space, itemSends);

    // Phase 3: zone deletes LAST. The server cascade keys off each item's persisted
    // zoneId, so an FR-5 reassignment out of this zone must have landed before the
    // cascade runs — otherwise the cascade destroys an item the user moved to safety.
    const zoneDeleteSends = plan.phase2.zoneDeletes.map((op) => ({
        op, key: op.id, send: () => api.removeZone(spaceId, op.id),
    }));
    await runSends(space, zoneDeleteSends);
}
```

Rename `phase2.zoneDeletes` → `phase3` in `FlushPlan` so the ordering constraint is
carried by the type rather than by convention, and add a `useSpacesStore.flush.test.ts`
case in the shape of T-34.11: move an item out of a zone, delete that zone in the same
window, assert `api.removeZone` is not called until `api.updateItem` has resolved.

---

## 🟠 Major (strongly recommended)

### [M1] A failed space-scalar update rolls back `space.zones` / `space.items` to a stale array — reverting sibling edits that already succeeded

**File**: `src/Tidansu.App/src/data/pendingChanges.ts:209-215`, with `:71-82` and `:95-101`
**Category**: Correctness (violates FR-11's acceptance criterion directly)

**Description**
`touch()` snapshots the whole entity via `cloneEntity`, and `cloneEntity` is a
one-level clone that copies **arrays by value**:

```ts
// pendingChanges.ts:75
if (Array.isArray(value)) { clone[key] = [...value]; }
```

For `kind: 'space'` the entity is a `Space`, so the snapshot captures `zones: [...]` and
`items: [...]` as they stood at first touch. `rollbackSpace` then blanket-assigns it back:

```ts
// pendingChanges.ts:212-214
if (op.op === 'update' && op.snapshot) {
    Object.assign(space, op.snapshot);   // ← also assigns .zones and .items
}
```

Failure scenario:

1. `renameSpace(id, 'Cellar')` at t=0 → space snapshot taken, `snapshot.items` has 12 items.
2. `addItemStructured(id, 'Butter', …)` at t=120 → `space.items.push(butter)` (13 items).
3. Flush at t=400. Phase 1 `PUT /fields` fails (500, offline, dropped connection — there
   is no plan gate on this endpoint, so it needs a real error, but that is not exotic).
4. `recordFailure` → `applyRollback` → `space.items` is reset to the 12-item array.
5. Phase 2 then sends `POST /items` for Butter, which **succeeds**. The server has 13 items;
   the UI shows 12. Butter has silently vanished from the user's screen.

The mirror case is worse-looking: rename + `removeItem` in one window, rename fails → the
deleted item is resurrected in the UI while the server has correctly dropped it.

This is precisely what `task.md`'s AC forbids: *"a rejected mutation must only roll back
itself, not sibling edits that already succeeded"*. The existing test does not catch it
because its fixture has empty collections:

```ts
// pendingChanges.test.ts:305-307
const space = makeSpace({ name: 'Renamed fridge' });   // zones: [], items: []
const snapshot = makeSpace({ name: 'Fridge' });        // zones: [], items: []
```

With both arrays empty, the stomp is invisible.

**Recommendation**
The `'space'` entry should only ever own the scalar field set that `PUT /fields` actually
sends — mirroring `toSpaceFieldsBody`. Narrow the rollback rather than the snapshot (a
narrowed snapshot would silently break if a new scalar is added):

```ts
const SPACE_SCALAR_KEYS = ['name', 'type', 'viewMode', 'canvasMode', 'layoutColumns', 'columnLabels'] as const;

function rollbackSpace(space: Space, op: FlushOperation<Space>): void {
    // Assign ONLY the fields PUT /fields owns. A blanket Object.assign would also
    // restore `zones`/`items` from the snapshot's stale array copies, reverting
    // sibling zone/item adds+deletes that succeeded in the same window (FR-11).
    if (op.op !== 'update' || !op.snapshot) return;
    for (const key of SPACE_SCALAR_KEYS) (space[key] as unknown) = op.snapshot[key];
}
```

Then strengthen `pendingChanges.test.ts:305` to use a fixture with a non-empty `items`,
mutate the array after `stageUpdate`, and assert the array survives the rollback. That
assertion is what would have caught this.

### [M2] `handleSyncError`'s `hydrate(true)` re-syncs every space, including ones with live pending edits

**File**: `src/Tidansu.App/src/stores/useSpacesStore.ts:106-115`
**Category**: Correctness
**Your question 1 — yes, this is real. Narrow, but real.**

**Description**
`handleSyncError` is only reachable from `createRemote`/`deleteRemote`, which B-15 spec'd
as unchanged — but its blast radius is not scoped to the failing space:

```ts
function handleSyncError(error: unknown): void {
    const reason = planReasonOf(error);
    if (reason) { openPaywall(reason); void hydrate(true); }
```

`hydrate(true)` does `spaces.value = list` (`:313`), wholesale replacing every `Space`
object. It does **not** clear `changeSets`, `saveTimers` or `inFlight`. So after a
spaces-cap 403 on a create:

- Every other space's `ChangeSet` still holds `PendingEntry.entity` references to the
  **detached, pre-hydrate** objects. The user's optimistic edits to those objects are
  invisible in the UI (which now renders the freshly fetched ones) but are still staged.
- The armed debounce timer then fires, `runFlushPlan` does `getById(spaceId)` → the *new*
  object, while `payload` is cloned from the *old* one. The edit is sent to the server and
  persists — but the UI never shows it until the next reload. Rollback-on-failure would
  `Object.assign` snapshots of dead objects onto the new ones.

So a plan-limit rejection on space **create** can make an unrelated space's in-flight edit
disappear from the UI while it silently lands on the server. That is the same class of
divergence FR-11 exists to prevent — the create path just wasn't reworked to match.

**Recommendation**
Don't re-sync the account to undo one op. The create path already knows exactly what to
undo — the same rollback philosophy the rest of the flush now uses:

```ts
function createRemote(space: Space): void {
    void api.create(space).catch((error) => {
        const reason = planReasonOf(error);
        if (!reason) { console.error('[spaces] create failed', error); return; }
        openPaywall(reason);
        // Roll back only this op — a full hydrate(true) would replace every Space
        // object while other spaces' ChangeSets still reference the old ones (their
        // staged edits would then land server-side but never re-appear in the UI).
        spaces.value = spaces.value.filter((s) => s.id !== space.id);
        changeSets.delete(space.id);
        const t = saveTimers.get(space.id);
        if (t) clearTimeout(t);
        saveTimers.delete(space.id);
    });
}
```

If you'd rather keep `hydrate(true)` for now (defensible — create/delete are out of scope
and this needs a cap-403 to fire), then at minimum make it honest: clear `changeSets`,
`saveTimers` and `inFlight` inside `hydrate(force = true)` so stale entries can't be
flushed against replaced objects, and drop a comment saying B-15's per-op rollback rule
deliberately does not extend to the whole-space create/delete path yet. Silently keeping
both is the bad option.

### [M3] `RemoveItemAsync` materialises the item's photo data-URL just to delete the row

**File**: `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs:354-362`
**Category**: Correctness / cost

**Description**
```csharp
var item = await GetItemAsync(spaceId, itemId, userId, cancellationToken);
if (item is null) return false;
dbContext.Set<Item>().Remove(item);
```
`GetItemAsync` selects the full `Item`, including `Photo` (`nvarchar(max)`, up to ~7 MB
base64). Deleting one photo-bearing item pulls that blob out of SQL, across the network,
into the change tracker, and throws it away — to issue `DELETE FROM Item WHERE Id = @p0`.

This directly contradicts the discipline the sibling method's own comment states at
`:331-337`: *"loading the zone's items to RemoveRange them would materialise every photo
data-URL in the zone into memory just to delete rows — exactly the write/read
amplification this task exists to remove."* `RemoveZoneWithItemsAsync` got it right;
`RemoveItemAsync`, ten lines below, does the thing the comment forbids. That's the kind of
inconsistency the next reader resolves in the wrong direction.

**Recommendation**
Owner-scoped set-based delete, same shape as the cascade — the `Where` still carries
`(spaceId, itemId, userId)` so D-3 holds:

```csharp
public async Task<bool> RemoveItemAsync(string spaceId, string itemId, string userId, CancellationToken cancellationToken = default)
{
    // Set-based, same rationale as RemoveZoneWithItemsAsync (SC-2): loading the item
    // to Remove() it would pull its nvarchar(max) photo data-URL into memory just to
    // delete the row. Ownership stays in the predicate — no unscoped reach.
    var deleted = await dbContext.Set<Item>()
        .Where(i => i.Id == itemId
                    && i.SpaceId == spaceId
                    && dbContext.Spaces.Any(s => s.Id == spaceId && s.UserId == userId))
        .ExecuteDeleteAsync(cancellationToken);
    return deleted > 0;
}
```

The same applies, less severely, to `AddItemCommandHandler`/`UpdateItemCommandHandler`
echoing the full photo back in the response — see [N7].

### [M4] The `sp_getapplock` preamble is now copy-pasted three times

**File**: `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs:57-108`, `:192-249`,
`:254-297`
**Category**: Maintainability (CLAUDE.md DRY)

**Description**
`AddWithinSpaceCapAsync`, `AddZoneWithinCapAsync` and `AddItemWithinCapAsync` each carry
their own verbatim copy of: begin transaction → build resource key → raw
`DECLARE/EXEC sp_getapplock/SELECT` → `ToListAsync().Single()` → `if (lockResult < 0)`
fail-closed → rollback → throw. `AddZoneWithinCapAsync` and `AddItemWithinCapAsync` differ
only in `CountZonesAsync` vs `CountItemsAsync`, `Set<Zone>` vs `Set<Item>`, and the cap
argument. `AddZoneAsync`/`AddItemAsync` are likewise identical modulo the entity type, as
are `AddZoneCommandHandler`/`AddItemCommandHandler` (~90% shared, including the outcome
`switch`).

The comment at `:183-186` argues the one-resource-per-space design keeps B-12's
no-deadlock property *"structural rather than an invariant a future edit could silently
break"* — but with three hand-maintained copies of the lock block, the resource-key
string is exactly such an invariant. Change one, miss the others, and the failure is
invisible to `dotnet build` and to the current test suite (no repository tests).

**Recommendation**
Extract one private helper and let all three call it:

```csharp
// The single implementation of B-12's lock protocol. Every caveat lives here once:
// RETURN-code capture, ToListAsync (non-composable batch), fail-closed, and the
// no-EnableRetryOnFailure precondition. Do not inline a second copy.
private async Task<T> WithinAppLockAsync<T>(
    string resource, string lockSubject,
    Func<IDbContextTransaction, Task<T>> body, CancellationToken cancellationToken)
```

with `AddZoneWithinCapAsync`/`AddItemWithinCapAsync` collapsing to a shared
`AddContentWithinCapAsync<T>(T entity, string spaceId, string userId, int cap, Func<…, Task<int?>> count)`.
Not a blocker, but this is ~150 lines of duplicated concurrency-critical code landing in
one commit, and it's cheaper to collapse now than after it drifts.

---

## 🟡 Minor (nice-to-have)

### [N1] `vite.config.ts`'s scope comment is already false
**File**: `src/Tidansu.App/vite.config.ts:15-19`
"*vitest covers only `pendingChanges.ts`'s pure coalescing rules today — no jsdom, no
component/store tests*" — but `src/stores/useSpacesStore.flush.test.ts` is a store test,
added in the same change, and it's the most valuable file in the diff. Reword to
"pure modules + the store's flush orchestration (no jsdom, no component tests)". You
explicitly asked for false comments; this is one.

### [N2] `PlanPolicy.CheckAddItem`'s comment cites a test that no longer exists
**File**: `src/Tidansu.Domain/Constants/PlanPolicy.cs:88`
"*T-6 pins this ordering with a case at `currentItems == cap` where both would fire*" —
present tense, but T-6's equivalence theory was deleted in T-8 (as the same file's block
comment at `:59-61` correctly says in the past tense). The case does survive, in
`PlanPolicyTests.CheckAddItem_returns_expected`
(`[InlineData(Plan.Free, 50, PhotoChange.Added, PlanLimitReasons.Photos)]`). Point the
comment there so the next reader can find the thing that pins the invariant.

### [N3] `ItemDtoValidator`'s "no referential check" is now only true of the validator
**File**: `src/Tidansu.Application/Spaces/Dtos/ItemDtoValidator.cs:16-18`
"*ZoneId is an intentionally loose reference (no FK) — length only, no referential
check.*" Accurate about this class; misleading about the system, since B-15's approved
decision #2 added exactly that check in `AddItemCommandHandler`/`UpdateItemCommandHandler`
(`ZoneExistsInSpaceAsync`). Suffix: "*…no referential check **here** — the handler
enforces it (B-15 FR-4); this stays length-only so the 400 can't preempt the photos
403.*"

### [N4] The store docstring's phase-2 rationale doesn't cover zone deletes
**File**: `src/Tidansu.App/src/stores/useSpacesStore.ts:48-51`
"*item add/update/delete + zone delete (item ops need their zone to exist server-side
first)*" explains why items follow zone **adds**, and silently implies zone **deletes**
belong in the same bucket for the same reason. They don't — they need the opposite
ordering. Fix alongside [C1].

### [N5] `saveState` grows without bound
**File**: `src/Tidansu.App/src/stores/useSpacesStore.ts:68-70`, `:98-100`
Every op writes a `'saved'` entry keyed by entity id and nothing ever removes it, so the
map grows monotonically for the session (one entry per item/zone ever touched — a heavy
editing session on a Pro account is thousands). B-19 consumes this; worth pruning `'saved'`
entries or dropping them once observed, before B-19 builds on the assumption that every
key is meaningful.

### [N6] Rolling back a delete re-appends the entity at the end of the array
**File**: `src/Tidansu.App/src/data/pendingChanges.ts:228-229`, `:245-246`
`space.zones.push(op.snapshot)` / `space.items.push(op.snapshot)` restore membership but
not position. Zones are ordered by `position` so they're fine; items in a zone are laid
out by `slotIndex`, also fine — but if any view ever iterates `space.items` raw, a failed
delete silently reorders it. Cheap to note in the comment; not worth code today.

### [N7] Add/update item responses echo the full photo back
**File**: `src/Tidansu.Application/Spaces/Commands/AddItem/AddItemCommandHandler.cs:77`,
`.../UpdateItem/UpdateItemCommandHandler.cs:72`
`ItemDto.FromEntity(entity)` includes `Photo`, so a save of a photo-bearing item returns
~7 MB the client already has — and `useSpacesApi.addItem/updateItem` mostly discards it
(`res?.data ? toItem(res.data) : item`). Adjacent to SC-4 (which is B-16's, and out of
scope on the *request* side); flagging only so B-16 picks up the response direction too,
not asking for a change here.

### [N8] Client-supplied entity ids make a retried add a 500, not an idempotent no-op
**File**: `src/Tidansu.Application/Spaces/Commands/AddItem/AddItemCommandHandler.cs:49`,
`.../AddZone/AddZoneCommandHandler.cs:35`
`dto.ToEntity(spaceId)` carries the client's `Id` straight into the insert (unchanged from
the whole-space PUT, so not a regression). But per-entity adds are now individually
retryable: if a `POST /items` response is lost and the client resends, the second insert
hits a duplicate PK → `DbUpdateException` → 500. B-19 owns the retry UX; worth knowing the
server has no idempotency story before B-19 designs one on top of it.
*(The cross-tenant flavour of this — a PK collision against another user's id revealing
existence — is trust-boundary shaped: deferred to security review.)*

### [N9] "before anything else runs" isn't quite true
**File**: `src/Tidansu.Application/Spaces/Commands/AddItem/AddItemCommandHandler.cs:26-27`,
`.../AddZone/AddZoneCommandHandler.cs:24-25`
Both say the owner-scoped count runs "*before anything else runs*", but
`userService.FindByIdAsync` runs first in both. Harmless (a user lookup leaks nothing about
the space), but the sentence is the kind of absolute a future reader will trust. "*before
any space-scoped work, including before any lock is taken*" is what's actually true.

---

## 🧭 Convention Violations (project rules)

- [ ] **None on the frontend conventions.** No `<template>` changes in this diff at all —
      template purity, variant maps, `@theme` tokens and static-Tailwind are untouched and
      unviolated. No `any` introduced (`pendingChanges.ts` uses `unknown` + narrow casts;
      the `as unknown as ItemDto`/`ZoneDto` casts in `spaceMapping.ts:90,95` follow the
      pre-existing, documented rect-nullability pattern).
- [ ] **Clean Architecture: clean.** No EF/DbContext in Application or Domain; `PhotoChange`
      correctly placed in Domain next to `PhotoPolicy` with the "*a photo concept, not a
      plan concept*" justification; `ContentInsertOutcome` in `Domain/Repositories`;
      interface in Domain, impl in Infrastructure.
- [ ] **Controllers delegate only.** `SpaceItemsController` / `SpaceZonesController` /
      `SpacesController.UpdateSpaceFields` are `mediator.Send` + `ApiOperationResult.Ok`.
      Both new controllers carry `[Authorize]` at class level.
- [ ] **CQRS shape:** all six triplets are `Command`/`Handler`/`Validator` in
      `Feature/Commands/DoThing/`. Constructor injection throughout.
- [ ] `src/Tidansu.App/.claude/agent-memory/` and
      `src/Tidansu.Application/Spaces/Commands/.claude/agent-memory/` — agent scratch
      written *inside the product source trees* (you're cleaning agent-memory separately,
      but these two are not under the repo's `.claude/`; they'd ship in the source tree).
- [ ] **DRY:** see [M4] — the only real violation in the diff.
- [ ] **Migration:** correctly absent. No entity or `TidansuDbContext` change; D-5's
      "if you're writing a migration, the plan is wrong" held.
- [ ] **Kiota:** regenerated, not hand-edited (`kiota-lock.json` + `models/index.ts` +
      new `zones/`/`items/`/`fields/` request builders; the whole-space `put` is gone from
      `api/spaces/item/index.ts`). Reviewed as contract-shaped, per your instruction.

## 🏗️ Architecture Notes

**The comments are, with the three exceptions above, unusually good and load-bearing** —
the D-1 derivation table in `PlanPolicy.cs:27-61`, the two `PhotoChangeBetween` traps in
`PhotoPolicy.cs:137-160`, the T-13e "read `item.Photo` into a local BEFORE assigning"
warning at `UpdateItemCommandHandler.cs:40-44`, the "deliberately tracked, NOT
`AsNoTracking()`" note at `SpacesRepository.cs:156-159`, and the `finally`-is-load-bearing
docstring at `useSpacesStore.ts:256-266` (pinned by a test that was *verified to have
teeth by deleting the `finally`* — that's the right standard). I checked each against the
code; they describe what's there.

**The absence of `CheckUpdate*`/`CheckDelete*` is correctly implemented and correctly
explained.** I verified the reduction holds and did not re-litigate it. The "do not add
one" warnings at `PlanPolicy.cs:44-51`, `UpdateZoneCommandHandler.cs:24-27` and
`UpdateSpaceFieldsCommandHandler.cs:26-29` are the right defence for a rule whose
correctness lives in an absence.

**Dead code:** clean. `ReplaceAsync`, `UpdateSpaceCommand{,Handler,Validator}` and
`CheckSpaceMutation` are gone with zero stale call sites (`SpaceUsage` correctly survives —
still used by `CheckNewSpace`/`CreateSpaceCommandHandler`). Every remaining
`CheckSpaceMutation` mention is a past-tense derivation reference, which is the point.

**Scope creep:** none material. `vitest` is approved and correctly scoped; `SpaceFieldsDto`
+ its validator are FR-7; the `SpacePhotoGuard` overload + `MessageForInvalid` extraction
(T-27) is a real DRY win, not creep.

**Tech debt introduced:** [M4]'s triplicated lock protocol, and a frontend test suite whose
fixtures (`pendingChanges.test.ts:50-63`) default to empty `zones`/`items` — the shape that
let [M1] through. Consider making `makeSpace()` default to *non-empty* collections so
future rollback tests are load-bearing by default.

**On your question 2 (`sp_getapplock` on `zone.SpaceId` before ownership is confirmed):**
I agree it's a non-issue, and I'd go further — the premise is slightly off. At the
*handler* level ownership **is** already confirmed before the lock: `AddZoneCommandHandler`
(`:26-27`) and `AddItemCommandHandler` (`:28-29`) both run the owner-scoped
`CountZonesAsync`/`CountItemsAsync` and 404 on `null` before ever calling
`AddZoneWithinCapAsync`. A cross-user or unknown space id never reaches the lock. What's
true is that the *repository method in isolation* locks before it verifies, and its
contract doesn't say the caller must pre-verify — which is a documentation gap, not a
defect: the in-lock `CountZonesAsync` is owner-scoped and returns `SpaceNotFound`, so even
a hypothetical unverified caller stays correct and leaks nothing. The contention surface
is a 5 s exclusive lock on a hash of a space id, reachable only by an authenticated user,
and only along a path that has already 404'd for ids they don't own. Worth one line on
`AddZoneWithinCapAsync`'s XML doc ("*callers must already have owner-verified `spaceId`;
the in-lock recount is defence-in-depth, not the ownership check*") so a future caller
doesn't take it as a standalone primitive. The authz framing is the security reviewer's.

## 👍 Positives

- The D-1 decomposition is ported **exactly**, and the comment carries the derivation
  rather than the conclusion — the single best thing in this diff for its future readers.
- `PhotoChangeBetween`'s two traps are implemented right *and* pinned by
  `[InlineData(null, "", PhotoChange.Added)]` / `[InlineData("a", "a", PhotoChange.None)]`.
  Those tests have teeth: swapping in `IsNullOrEmpty` reddens the first.
- `T-34.12c` is exemplary — testing that a `finally` exists by forcing an unexpected throw
  through a partial mock, and stating in the comment that it was verified by deleting the
  `finally` and watching it fail. That is the difference between 23 green tests and 23
  meaningful ones.
- `ContentInsertOutcome` over an overloaded `bool?`, with the "why not bool" reason
  recorded on the enum.
- The `ISpacesRepository` D-3 shape — making an unscoped mutation *inexpressible* rather
  than remembering to check per-endpoint — is the right kind of structural fix, and the
  "do not add a convenience overload without userId" note protects it.
- `GetByIdWithoutContentAsync` existing at all, with the "do not reuse `GetByIdAsync`
  here" warning, shows the B-14 cost lesson actually landed.
- `SpaceFieldsDto.FromEntity`'s comment about *not* being `SpaceDto.FromEntity` (empty
  collections would be a lie, not a fact) is exactly the right instinct.

## Action Checklist

- [ ] **[C1]** Move zone deletes into their own phase after item ops settle; rename
      `phase2.zoneDeletes` → `phase3`; add the move-out-then-delete-zone flush test.
- [ ] **[M1]** `rollbackSpace` must assign only the six scalar keys, never
      `zones`/`items`; give the test a non-empty fixture.
- [ ] **[M2]** Replace `handleSyncError`'s `hydrate(true)` with a per-op rollback of the
      failed create (or, if deferring, clear `changeSets`/`saveTimers`/`inFlight` inside
      `hydrate(force)` and say so in a comment).
- [ ] **[M3]** `RemoveItemAsync` → owner-scoped `ExecuteDeleteAsync`; stop loading the
      photo blob to delete a row.
- [ ] **[M4]** Extract one `WithinAppLockAsync` helper; collapse the three lock copies and
      the two `AddXWithinCapAsync` bodies.
- [ ] **[N1]** Fix `vite.config.ts`'s "no store tests" comment.
- [ ] **[N2]** Repoint `CheckAddItem`'s "T-6 pins this" to `CheckAddItem_returns_expected`.
- [ ] **[N3]** Scope `ItemDtoValidator`'s "no referential check" to the validator.
- [ ] **[N4]** Fix the store docstring's phase-2 rationale (with [C1]).
- [ ] **[N5]** Prune `saveState`'s `'saved'` entries.
- [ ] **[N6]** Note the delete-rollback re-append ordering.
- [ ] **[N7]** Hand the response-side photo echo to B-16.
- [ ] **[N8]** Note the add-retry/duplicate-PK gap for B-19.
- [ ] **[N9]** Soften "before anything else runs" in the two add handlers.
- [ ] Move the two `.claude/agent-memory/` dirs out of `src/`.
- [ ] Add the "callers must pre-verify ownership" line to `AddZoneWithinCapAsync`'s doc.
