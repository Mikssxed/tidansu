# B-15 · Technical Tasks — Granular item/zone endpoints

Source: [`requirements.md`](./requirements.md) (FR-1…FR-13) · Brief: [`task.md`](./task.md)

**Legend** — risk: 🔴 high · 🟠 medium · 🟢 low.
**⛔ GATE** = the orchestrator pauses here. Narrowed after review to the set that
earns it: **T-4, T-6, T-7, T-8** (the plan-gate rule + its proof) and **T-16** (the
cap lock). An earlier draft marked 18 of 34 tasks ⛔, which collapses to "pause
always" and stops being a signal — that was a mistake, and the coordinator's read is
correct. Everything else batches.

**🔗 UNSPLITTABLE** = may be batched, but not split *across* runs (see
"Batching notes" below).

All four Open Questions were closed at the tech-planning gate (2026-07-15); §5 records
the answers and what they changed. The OQ-4 `design-an-interface` exploration ran — its
result is folded into **T-24**, and the two bugs it found in this plan are fixed in
**T-25 / D-7 / SC-6** (BUG 1) and **SC-9** (BUG 2).

---

## Batching notes (for the orchestrator)

- **Pause at ⛔ only**: T-4, T-6, T-7, T-8, T-16.
- 🔗 **T-9 + T-13d + T-13e must go out in one run.** They are the photo trust boundary:
  T-9 moves the guard, T-13d/e are the two call sites that must order it *after* the
  plan gate. Split across runs, the second run has no way to see that the ordering
  invariant it depends on was just moved — and the failure (a Free user getting a 400
  instead of the 403 paywall) is invisible to `dotnet build`. Not a request for another
  pause; a request not to split the batch.
- 🔗 **T-25 should be its own run**, not batched with T-24 or T-26. It is the largest
  single-file rewrite in the task and it carries both bugs the exploration found
  (BUG 1 phase-2 drop rule, BUG 2 overlapping flushes). It is not plan-limit logic, so
  it is not ⛔ — but it is the data-loss surface on the autosave path.
- The remaining CQRS triplets (T-13a/b/c/f) share no invariant beyond the six rules
  written into T-13; batch them freely.

---

## 0. Decisions taken before the task list (read first)

### D-1 · The plan gate decomposes by algebra, not by re-counting the graph (FR-8) ⛔

Today's gate is `PlanPolicy.CheckSpaceMutation(plan, before, after)`:

```
reject zones  ⟺  after.Zones > cap  ∧  after.Zones > before.Zones
```

Every granular mutation is one of three shapes, and the rule collapses differently
for each:

| shape | count delta | the old rule reduces to |
|---|---|---|
| **add one** | `after = before + 1` | `before + 1 > cap ∧ before + 1 > before`. The right conjunct is **always true** for an add, so this is exactly **`before >= cap`**. |
| **update** | `after = before` | `after > before` is **always false** → **never rejected**. |
| **delete** | `after = before - 1` | `after > before` is **always false** → **never rejected**. |

This is the whole answer to "how does the gate decompose without weakening":

- **Adds** gate on `currentCount >= cap`. That is not a naive rule — it is the old
  rule *specialised to a +1 delta*, and it is provably identical.
- **Updates and deletes are not gated at all.** There is no gate call to make. This is
  precisely what keeps a downgraded Free user (8/6 zones) able to rename and delete
  their over-cap content: the code path that could reject them does not exist.

The trap the brief warns about — "a naive `count >= cap → reject` breaks editing for
downgraded users" — is only a trap if `count >= cap` is applied to *updates*. It must
be applied **only to growing mutations**. Task **T-4** encodes this; task **T-6** pins
the equivalence with a test before the old method is deleted.

**Consequence for cost:** an add needs exactly one integer — the current count for that
one dimension in that one space. That is a `SELECT COUNT(*)`, not a graph load. No
granular handler may call `ISpacesRepository.GetByIdAsync` (it `.Include`s Zones **and**
Items, i.e. every photo data-URL — the exact cost B-14 removed and B-16 is about).

### D-2 · Photos are a capability, not a count (FR-4 / FR-5)

Per-item, the photo dimension has four transitions. `PhotoChangeBetween(existing, incoming)`:

| existing | incoming | change | Free |
|---|---|---|---|
| `null` | `null` | `None` | allow |
| `null` | non-null | `Added` | **reject `photos`** |
| non-null | different non-null | `Replaced` | **reject `photos`** |
| non-null | **identical** non-null | `None` | **allow** |
| non-null | `null` | `Removed` | allow |

Two rules here are load-bearing and easy to get wrong:

1. **Identical photo ⇒ `None` ⇒ allowed.** The client PUTs the *whole* item, so a
   downgraded Free user renaming a photo-bearing item resends the same photo string. A
   rule of "any non-null photo on Free → reject" would make every such item permanently
   uneditable — this is the real form of the "naive rule breaks downgraded editing"
   trap on the photo axis.
2. **`null` is the only "no photo".** Not `string.IsNullOrEmpty`. Today's count is
   `Items.Count(i => i.Photo is not null)`, and `PhotoPolicy.Check("")` returns
   `Empty` (a rejection, i.e. an *invalid photo*, not *no photo*). So
   `PhotoChangeBetween(null, "")` **must** return `Added` — otherwise a Free user
   sending `photo: ""` skips the plan gate and gets `SpacePhotoGuard`'s 400 instead of
   the 403 paywall, inverting B-13's deliberate ordering.

**✅ CLOSED (OQ-1, confirmed at the tech-planning gate) — an accepted, deliberate
tightening. Do not "fix" it back.** `CheckItemPhotoChange` rejects `Replaced` on Free.
Today's count-delta rule *allows* a downgraded Free user to swap an existing photo for a
different one (count unchanged → `after.Photos > before.Photos` is false). FR-5 gates
replacement, and that is the intended behaviour: **photos are a capability, not a
count** — the count-delta shape was only ever an artifact of having nothing but
whole-graph counts to reason from. A reviewer who diffs against `CheckSpaceMutation`
will read this as a faithfulness bug. It is not. **Still allowed on Free:** removing a
photo (`Removed`), editing any other field of a photo-bearing item, and resending an
identical photo (`None` — see rule 1 above).

### D-3 · Ownership is enforced by making the unsafe call unrepresentable (FR-10)

Not by "remember to check owner in each of the 7 handlers" — that is 7 chances to
forget, and the brief is right that one miss is a cross-user write.

**The rule: no method on `ISpacesRepository` that reaches a zone or an item takes fewer
than `(spaceId, entityId, userId)`.** Every such query is rooted at
`dbContext.Spaces.Where(s => s.Id == spaceId && s.UserId == userId)` and reaches the
child through the navigation. There is no overload that resolves a zone/item by bare
id, so a handler *cannot* express an unscoped mutation. A reviewer's check becomes
"does the interface offer an unsafe method?" (no) rather than "did all 7 call sites
remember?".

A miss returns `null` → `NotFoundException` → 404 from `ErrorHandlingMiddleware`.
Unknown id and other-user id are the same code path, so they cannot diverge in status,
body, or timing shape. **No `ForbidException` on these paths, ever** — it would confirm
the id exists.

### D-4 · The B-12 lock pattern does apply here, keyed per-space, Free-only (FR-9) 🔴 ⛔

The race is the same shape: read count under cap → insert; two concurrent requests both
read 49/50 and both insert. So yes — the same `sp_getapplock` pattern, with these
decisions made explicitly:

- **Key per *space*, not per user.** The contended resource is one space's zone/item
  count. `tidansu:space-content:{SHA256(spaceId)}`.
- **One lock resource per space, covering zones *and* items** (not two). B-12's
  no-deadlock argument is *"a single resource per transaction so it cannot deadlock"*.
  Two resources would keep that property only while no transaction ever takes both —
  an invariant a future edit can silently break. One resource makes it structural. The
  cost is that a batch's zone-add and item-adds against the same space serialize; each
  is a `COUNT(*)` + single insert (milliseconds), and it is one user's own space, so
  contention is negligible.
- **Free-only.** `PlanCaps.For(Pro).Zones/Items` are `null` (unlimited) → nothing to
  race → Pro takes **no lock at all** and is never serialized. Exactly mirrors
  `CreateSpaceCommandHandler`'s `if (spaceCap is int cap)` branch.
- **Ownership is resolved *before* the lock**, so an unowned/unknown space 404s without
  ever taking a lock.

**Knowledge carried forward from `AddWithinSpaceCapAsync` — do not re-derive, do not
drop from the comments:**
- `sp_getapplock` reports via **stored-proc RETURN code**, not by throwing. Negative =
  not granted. A discarded return value falls through to count+insert **without the
  lock held**, silently reopening the race.
- Materialize with **`ToListAsync()`**, not `SingleAsync`/`FirstAsync`: those compose a
  `TOP(N)` wrapper that EF rejects as non-composable over a multi-statement
  `DECLARE/EXEC/SELECT` batch.
- **Fail closed on a non-granted lock**: log + throw (→ 500). Never translate it into a
  `PlanLimitException` — that would tell an eligible user they are capped.
- **Hash the key** (`@Resource` is `nvarchar(255)`), even though `spaceId` is ≤64 chars.
- The context is registered **without `EnableRetryOnFailure`** (verified in
  `ServiceCollectionExtensions.cs` at plan time), so a manual `BeginTransactionAsync`
  is safe. **If retry-on-failure is ever enabled, every one of these methods must move
  inside `dbContext.Database.CreateExecutionStrategy().ExecuteAsync(...)`.** Repeat
  this comment on each new method.
- **Never scan photos while holding the lock.** `SpacePhotoGuard` runs in the handler,
  before the repository call — same as B-12.

### D-5 · No EF migration is required — and here is why that is not an oversight ⛔

Checked at plan time:

- No entity gains, loses, or changes a field. `Zone`, `Item`, `Space` are untouched.
- No new entity, index, default, or JSON column.
- `TidansuDbContext`'s model is unchanged.
- **The zone→items cascade (FR-3) needs no FK.** `Item.ZoneId` is deliberately *not* a
  foreign key (`item.Property(i => i.ZoneId).HasMaxLength(64)` — length only; the
  entity comment says "loose coupling, mirrors the client"). Introducing an
  `Item → Zone` FK to get a DB-level cascade **would** be a schema migration with real
  data risk (existing rows may reference ids that no longer resolve). Out of scope. The
  cascade is done set-based in the repository instead (**T-16**).

**⛔ If the developer finds themselves adding a migration, the plan is wrong — stop and
escalate.**

### D-6 · Route shape (and the Kiota trap that dictates it)

| verb | route | FR |
|---|---|---|
| `PUT` | `/api/spaces/{id}/fields` | FR-7 scalars |
| `POST` | `/api/spaces/{id}/zones` | FR-1 |
| `PUT` | `/api/spaces/{id}/zones/{zoneId}` | FR-2 |
| `DELETE` | `/api/spaces/{id}/zones/{zoneId}` | FR-3 |
| `POST` | `/api/spaces/{id}/items` | FR-4 |
| `PUT` | `/api/spaces/{id}/items/{itemId}` | FR-5 |
| `DELETE` | `/api/spaces/{id}/items/{itemId}` | FR-6 |
| ~~`PUT`~~ | ~~`/api/spaces/{id}`~~ | **removed** (FR-13) |

- **The space route parameter must be spelled `{id}` in every new route**, matching the
  existing `GET/DELETE /api/spaces/{id}`. Kiota derives its indexer name from the path
  parameter name; mixing `{id}` and `{spaceId}` at the same segment position yields two
  competing indexers (`.byId()` / `.bySpaceId()`) on the same `spaces` node. Consistent
  `{id}` gives one clean chain: `client.api.spaces.byId(x).zones.byZoneId(y)`.
- **`PUT /api/spaces/{id}/fields` — ✅ CLOSED (OQ-2), decided at the tech-planning gate.**
  This plan originally chose `PATCH /api/spaces/{id}`, reasoning that it reads naturally
  as "partial w.r.t. the space — omits zones/items" and leaves the removed `PUT`
  unambiguous in the generated client. **That was overruled**: the scalar fields get their
  own explicit sub-resource instead. The original reasoning was sound but is not the
  decision — recorded here so a reviewer sees it was considered and settled, not missed.
  Consequence to keep straight: the request body is the **complete** scalar set (see
  `SpaceFieldsDto`, T-11), not a sparse patch — `PUT` semantics, so every scalar field is
  sent and every one is written. The client always has all of them in hand, so this costs
  nothing and removes any "omitted vs null" ambiguity (which would collide with B-16 —
  see SC-4).
- Nesting zones/items under `{id}` is what makes D-3 natural: the space scope is in the
  route, so `(spaceId, entityId, userId)` is always in hand. `/fields` sits at the same
  level for the same reason.
- **`PUT /api/spaces/{id}/fields` returns `SpaceFieldsDto`, NOT `SpaceDto`** (decided
  during the T-10…T-12 run; this plan originally said `SpaceDto`). Reason, found while
  building it: `SpaceDto.FromEntity` reads `s.Zones`/`s.Items`, which default-initialize
  to `[]`. An entity loaded by `GetByIdWithoutContentAsync` (no `.Include`, which is the
  whole point of FR-7) would therefore **not** throw — it would silently return a
  `SpaceDto` asserting the space has **no zones and no items**. Loading them to avoid
  that would re-introduce exactly the cost FR-7 exists to remove. So the response is
  scoped to what was actually loaded and mutated. **Consequences for later tasks:**
  T-18's `[ProducesResponseType]` is `SpaceFieldsDto`; T-21's Kiota regen generates that
  shape; T-23's `updateFields` must **not** feed the response through `toSpace(...)` (it
  is not a whole space) — the store already holds the scalars it just sent, so the
  response is confirmation, not a source of truth to re-hydrate from.

### D-7 · Ordering constraint the client inherits from FR-4/FR-5

FR-4 ("the item's zone must belong to a space the caller owns") and FR-5 ("if the
update reassigns the item to a different zone, that zone must belong to the same
space") introduce a **referential check that does not exist today** (`ZoneId` is
currently unvalidated). Consequence: within one debounce flush, a zone-add must land
**before** an item-add that references it, or the item 404s. This forces a two-phase
flush on the client (**T-25**). **OQ-3 ✅ CLOSED — the check stays** (confirmed at the
tech-planning gate, accepted as new server behaviour despite `Item.ZoneId` being
commented as an intentionally loose reference; B-13 declined to enforce it, this task
enforces it).

**BUG 1 — the drop rule must cover reassigning updates, not just adds.** Found by the
OQ-4 exploration; this plan originally got it wrong. An earlier draft said: *an item
whose zone's phase-1 `add` failed is dropped and marked `failed`*. That covers item
**adds** only. But FR-5 lets an item **update** reassign an item to a *different* zone —
including one added in the same window. If that zone-add fails in phase 1, the
reassigning update is still sent in phase 2 and hits the very zone-existence check this
section is about.

Ordering itself is **not** the bug (all zone-adds are phase 1, all item ops are phase 2,
so ordering already holds). The bug is purely in the drop rule, which must be:

> After phase 1 settles, drop **every phase-2 item operation whose target `zoneId` is a
> zone whose phase-1 `add` failed** — whether that op is an `add` or an `update` that
> reassigns into the failed zone. Mark each dropped op `failed` and do not send it.

"Target `zoneId`" means the zone the item will live in *after* the op (the payload's
`zoneId`), not the one it came from. An item-`update` that merely edits a name while
staying in an existing, already-server-known zone is unaffected. Item-`delete` is never
dropped — deleting an item whose zone-add failed is still valid (the item may exist
server-side from an earlier window).

See **SC-6**.

---

## 1. 📋 Technical Tasks

### Backend — Domain

- [x] **T-1** 🟢 add `PhotoChange` enum (`None | Added | Replaced | Removed`) to
      `src/Tidansu.Domain/Constants/PhotoPolicy.cs`
      (*sits with `PhotoRejection`: it is a photo concept, not a plan concept, and keeps
      `PlanPolicy` free of blob strings*).
- [x] **T-2** 🟠 ⛔ add `public static PhotoChange PhotoChangeBetween(string? existing, string? incoming)`
      to `src/Tidansu.Domain/Constants/PhotoPolicy.cs`. Pure, no I/O. Comment the two
      rules from **D-2** verbatim: `null` is the only "no photo" (**not**
      `IsNullOrEmpty` — `""` is `Added`), and identical strings ⇒ `None`. Use
      `string.Equals(..., StringComparison.Ordinal)`; do not log or interpolate either
      argument.
      🔒 blocked by: T-1
- [x] **T-3** 🟢 add `ContentInsertOutcome` enum (`Inserted | AtCap | SpaceNotFound`) in
      `src/Tidansu.Domain/Repositories/ContentInsertOutcome.cs`
      (*`AddWithinSpaceCapAsync` returns `bool` because "space not found" cannot happen
      there; here the space can vanish under a concurrent delete, so three named
      outcomes beat `bool?`*).
- [x] **T-4** 🔴 ⛔ **THE CRUX.** add three per-mutation methods to
      `src/Tidansu.Domain/Constants/PlanPolicy.cs`, keeping the file pure/static:
      - `CheckAddZone(Plan plan, int currentZones)` → `Zones` iff `caps.Zones is int cap && currentZones >= cap`.
      - `CheckItemPhotoChange(Plan plan, PhotoChange change)` → `Photos` iff `!caps.Photos && change is Added or Replaced`.
      - `CheckAddItem(Plan plan, int currentItems, PhotoChange photo)` → **photos first**,
        then `Items` iff `caps.Items is int cap && currentItems >= cap`.

      Copy **D-1**'s algebraic derivation into the file as a comment — it is the review
      argument for why `>= cap` is not a weakening. Note explicitly that
      `CheckAddItem` checks **photos before items**, which *inverts* `CheckNewSpace`'s
      spaces→zones→items→photos precedence; that inversion is FR-4's explicit
      requirement, not an accident. Add **no** `CheckUpdateZone` — a shallow
      always-`null` pass-through would imply a decision exists where none does (D-1).
      Leave `SpaceUsage` and `CheckNewSpace` untouched (`CreateSpace` still uses both).
      🔒 blocked by: T-2, and **must not** be merged before T-6
- [x] **T-5** 🟠 ⛔ extend `src/Tidansu.Domain/Repositories/ISpacesRepository.cs`.
      Every signature below carries `userId` **by design** (D-3) — do not add
      convenience overloads without it:
      - `Task<Space?> GetByIdWithoutContentAsync(string id, string userId, ct)` — **no
        `.Include`** (*FR-7: renaming a space must not load every photo. Do not reuse
        `GetByIdAsync`, which includes Zones + Items*).
      - `Task<int?> CountZonesAsync(string spaceId, string userId, ct)` — `null` = not
        found / not owned.
      - `Task<int?> CountItemsAsync(string spaceId, string userId, ct)` — same.
      - `Task<Zone?> GetZoneAsync(string spaceId, string zoneId, string userId, ct)` — tracked.
      - `Task<Item?> GetItemAsync(string spaceId, string itemId, string userId, ct)` — tracked.
      - `Task<bool> ZoneExistsInSpaceAsync(string spaceId, string zoneId, string userId, ct)`.
      - `Task<ContentInsertOutcome> AddZoneWithinCapAsync(Zone zone, string userId, int zoneCap, ct)`.
      - `Task<ContentInsertOutcome> AddItemWithinCapAsync(Item item, string userId, int itemCap, ct)`.
      - `Task<bool> AddZoneAsync(Zone zone, string userId, ct)` / `Task<bool> AddItemAsync(Item item, string userId, ct)`
        — unlimited (Pro) path, no lock; `false` = space not found/not owned.
      - `Task<bool> RemoveZoneWithItemsAsync(string spaceId, string zoneId, string userId, ct)`.
      - `Task<bool> RemoveItemAsync(string spaceId, string itemId, string userId, ct)`.

      XML-doc `AddZoneWithinCapAsync`/`AddItemWithinCapAsync` in the same voice as
      `AddWithinSpaceCapAsync`: `AtCap` is an ordinary plan-limit rejection; a
      **throw** means the lock could not be acquired and the caller **must not**
      translate it into a plan-limit rejection.
      🔒 blocked by: T-3
- [x] **T-6** 🔴 ⛔ **write these tests before T-4 ships.** extend
      `tests/Tidansu.Domain.Tests/PlanPolicyTests.cs` — this is the repo's only real test
      surface, and this task's only genuinely provable logic:
      - `CheckAddZone`: Free 0/5 → `null`; Free **6 → `Zones`** (at cap); Free **8 → `Zones`**
        (downgraded, over cap, growing); Pro 999 → `null`.
      - `CheckAddItem`: Free 49 no-photo → `null`; Free 50 → `Items`; Free 0 **with photo →
        `Photos`** (well under the items cap — FR-4's AC); Free 50 **with photo → `Photos`**
        (photos wins over items — pins the inverted precedence); Pro anything → `null`.
      - `CheckItemPhotoChange`: Free `None`/`Removed` → `null`; Free `Added`/`Replaced`
        → `Photos`; Pro all four → `null`.
      - **Equivalence theory (temporary, deleted in T-8):** for `n` in 0…10 and both
        plans, assert
        `CheckAddZone(plan, n) == CheckSpaceMutation(plan, new SpaceUsage(n,0,0), new SpaceUsage(n+1,0,0))`
        and the same for items. Comment it as *"pins the decomposition against the
        rule it replaces; delete with `CheckSpaceMutation` in T-8"*. **This is the
        proof that FR-8 holds; run `dotnet test` and see it green before T-8.**
      🔒 blocked by: T-4
- [x] **T-7** 🟠 ⛔ extend `tests/Tidansu.Domain.Tests/PhotoPolicyTests.cs` for
      `PhotoChangeBetween`: `(null,null)→None`; `(null,"data:...")→Added`;
      **`(null,"")→Added`** (the empty-string-is-a-photo trap, D-2);
      `("a","a")→None`; `("a","b")→Replaced`; `("a",null)→Removed`; `("a","")→Replaced`.
      🔒 blocked by: T-2
- [x] **T-8** 🔴 ⛔ delete `CheckSpaceMutation` from
      `src/Tidansu.Domain/Constants/PlanPolicy.cs`, plus its `[Theory]` and the T-6
      equivalence theory from `tests/Tidansu.Domain.Tests/PlanPolicyTests.cs`
      (*dead once `UpdateSpaceCommandHandler` is gone (T-14); keeping it alive only to
      be tested would be dead production code*). Keep `SpaceUsage` + `CheckNewSpace`.
      🔒 blocked by: T-6 (green), T-14

### Backend — Application

- [x] **T-9** 🟠 ⛔ modify `src/Tidansu.Application/Spaces/Dtos/SpacePhotoGuard.cs`:
      extract the per-photo core to `ThrowIfInvalid(string? photo, string errorKey)`
      and have the existing `ThrowIfInvalid(SpaceDto)` delegate per item with key
      `$"Space.Items[{i}].Photo"` (*unchanged behaviour for `CreateSpace`*). The
      granular path passes key `"Item.Photo"` (FR-12: "adapted to identify the one item
      in the request"). Keep the fixed-message rule — **never** interpolate the photo
      into a message or log (B-13 S-5). One implementation, two callers.
- [x] **T-10** 🟢 add `SpaceFieldsDto` (Name, Type, ViewMode, CanvasMode, LayoutColumns,
      ColumnLabels — **no** Zones/Items) in
      `src/Tidansu.Application/Spaces/Dtos/SpaceFieldsDto.cs`. XML-doc the
      `PUT /api/spaces/{id}/fields` semantics (D-6/OQ-2 — this is a full-replace `PUT`,
      **not** a sparse PATCH): all scalar fields are **required and replace the scalar set**;
      `ColumnLabels: null` **clears** the labels (it is not "leave unchanged"). FR-7
      always sends the full scalar set, so there is no absent-vs-null ambiguity to
      resolve.
- [x] **T-11** 🟢 add `SpaceFieldsDtoValidator` in
      `src/Tidansu.Application/Spaces/Dtos/SpaceFieldsDtoValidator.cs`, mirroring
      `SpaceDtoValidator`'s scalar rules **verbatim** (Name ≤120, Type ≤16, ViewMode ≤16,
      CanvasMode ≤16, all `NotEmpty`). Do **not** carry over the Id rule (it is on the route).
- [x] **T-12** 🟠 add the `UpdateSpaceFields` command triplet in
      `src/Tidansu.Application/Spaces/Commands/UpdateSpaceFields/`:
      `UpdateSpaceFieldsCommand.cs` (`Id`, `Fields`), `UpdateSpaceFieldsCommandHandler.cs`,
      `UpdateSpaceFieldsCommandValidator.cs` (`Id` `NotEmpty`; `Fields` `NotNull().SetValidator(new SpaceFieldsDtoValidator())`).
      Handler: `GetByIdWithoutContentAsync` → `null` ⇒ `NotFoundException("Space", id)`;
      assign the six scalars; `SaveChangesAsync`. **No plan gate** (FR-7 is not gated —
      space count is checked at creation). **No `IUserService`/`FindByIdAsync` call** — it
      would load the user's plan for a decision that doesn't exist.
      🔒 blocked by: T-5, T-10, T-11
- [x] **T-13** 🔴 ⛔ add the six zone/item command triplets under
      `src/Tidansu.Application/Spaces/Commands/`. One task per folder, all following
      `.claude/skills/create-cqrs-command.md` + `.claude/templates/cqrs-*.cs`:

      - [x] **T-13a** 🔴 ⛔ `AddZone/{AddZoneCommand,AddZoneCommandHandler,AddZoneCommandValidator}.cs` (FR-1)
      - [x] **T-13b** 🟠 ⛔ `UpdateZone/{...}.cs` (FR-2)
      - [x] **T-13c** 🟠 ⛔ `RemoveZone/{...}.cs` (FR-3)
      - [x] **T-13d** 🔴 ⛔ `AddItem/{...}.cs` (FR-4, FR-12)
      - [x] **T-13e** 🔴 ⛔ `UpdateItem/{...}.cs` (FR-5, FR-12)
      - [x] **T-13f** 🟠 ⛔ `RemoveItem/{...}.cs` (FR-6)

      **Rules that apply to every one of the six** (state them once, obey them six times):
      1. Validators reuse `ZoneDtoValidator` / `ItemDtoValidator` unchanged, plus
         `RuleFor(c => c.SpaceId).NotEmpty()` (and `ZoneId`/`ItemId` where routed).
         **Do not add a photo rule to any validator.** FluentValidation's
         `ValidationBehavior` runs *before* the handler, so a photo rule there would
         return 400 and preempt the 403 paywall — inverting B-13's ordering. Photos are
         gated in the handler, then guarded by `SpacePhotoGuard`. (`ItemDtoValidator`
         already carries this comment; do not "fix" it.)
      2. Resolve the entity/count **owner-scoped** first; `null` ⇒
         `NotFoundException("Zone"/"Item", id)`. Never `ForbidException` (D-3).
      3. Plan gate **before** any mutation of tracked state and **before**
         `SpacePhotoGuard` (a Free user sending an invalid photo gets 403, never 400).
      4. `SpacePhotoGuard.ThrowIfInvalid(dto.Photo, "Item.Photo")` runs **outside** the
         repository's lock (D-4) — i.e. in the handler, before the repo call.
      5. Log ids only (`SpaceId`, `ZoneId`, `ItemId`, `UserId`). **Never** the photo.
      6. Return the persisted `ZoneDto`/`ItemDto`; deletes return nothing.

      **Per-handler specifics:**
      - **AddZone**: `CountZonesAsync` → `null` ⇒ 404. `PlanPolicy.CheckAddZone(user.Plan, count)`
        → cheap pre-check, throw `PlanLimitException(Zones)` (*keeps the ordinary at-cap
        rejection at today's latency — mirrors `CreateSpaceCommandHandler`*). Then
        `PlanCaps.For(plan).Zones is int cap` ? `AddZoneWithinCapAsync` (authoritative,
        locked) : `AddZoneAsync`. `AtCap` ⇒ `PlanLimitException(Zones)` + `LogWarning`
        ("zone cap race lost"); `SpaceNotFound` ⇒ 404.
      - **UpdateZone**: `GetZoneAsync` → 404 if null; assign the editable fields
        (Label, Color, Kind, Facing, Position, Column, GridCols, GridRows, HasDepth,
        Floor, Levels, Rect*); `SaveChangesAsync`. **No plan gate** — no zone field
        moves a capped dimension (D-1). Put that sentence in the handler as a comment so
        nobody "adds the missing check".
      - **RemoveZone**: `RemoveZoneWithItemsAsync` → `false` ⇒ 404. No plan gate.
      - **AddItem**: `CountItemsAsync` → 404 if null. `ZoneExistsInSpaceAsync` → `false`
        ⇒ `NotFoundException("Zone", dto.ZoneId)` (FR-4). Gate:
        `CheckAddItem(user.Plan, count, PhotoPolicy.PhotoChangeBetween(null, dto.Photo))`.
        Then `SpacePhotoGuard`. Then locked/unlocked insert exactly as AddZone, with
        `PlanCaps.For(plan).Items`.
      - **UpdateItem**: `GetItemAsync` → 404 if null. If `dto.ZoneId != item.ZoneId`,
        `ZoneExistsInSpaceAsync` → `false` ⇒ 404 (FR-5; moving between *spaces* is not
        expressible — the space is the route). Gate:
        `CheckItemPhotoChange(user.Plan, PhotoPolicy.PhotoChangeBetween(item.Photo, dto.Photo))`
        — **read `item.Photo` before assigning anything**. Then `SpacePhotoGuard`. Then
        assign and `SaveChangesAsync`. **No items-count gate** (D-1: count unchanged).
      - **RemoveItem**: `RemoveItemAsync` → `false` ⇒ 404. No plan gate.
      🔒 blocked by: T-4, T-5, T-9
- [x] **T-14** 🟠 ⛔ delete `src/Tidansu.Application/Spaces/Commands/UpdateSpace/`
      (`UpdateSpaceCommand.cs`, `UpdateSpaceCommandHandler.cs`,
      `UpdateSpaceCommandValidator.cs`) — FR-13. Keep `SpaceDtoValidator` and
      `SpacePhotoGuard.ThrowIfInvalid(SpaceDto)`: `CreateSpaceCommandValidator` /
      `CreateSpaceCommandHandler` still use them.
      🔒 blocked by: T-12, T-13

### Backend — Infrastructure

> ### ⚠️ 12 `NotImplementedException` stubs are live in `SpacesRepository.cs` right now
>
> **T-5 (done) extended `ISpacesRepository`, but its implementation is T-15/T-16 (below)
> — a different batch.** The interface extension alone breaks the whole-solution build,
> so the T-1…T-7 run added **12 throwing placeholder bodies** to
> `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs`, each commented and
> naming T-15 or T-16 as its replacement. This was the right call (a red build blocks
> every later task), but it is a **temporary, unsafe state**:
>
> - They are **unreachable today** — no Application/API caller exists (T-13 is pending),
>   verified by grep. That is the only thing making this safe.
> - **The moment T-13's handlers land, any surviving stub becomes a live 500.**
> - **T-15/T-16 must REPLACE these bodies, not build alongside them.** When both are
>   done, `grep -c "NotImplementedException" src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs`
>   must return **0**. T-31 checks this.
> - Do not let this ordering repeat: an interface-only task that precedes its
>   implementation across a batch boundary always forces this. Noted for B-16.

- [x] **T-15** 🟠 ⛔ implement the read/lookup half of T-5 in
      `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs`, **replacing that
      method's `NotImplementedException` stub** (see the warning above). Every query
      roots at `dbContext.Spaces.Where(s => s.Id == spaceId && s.UserId == userId)`:
      - `GetByIdWithoutContentAsync` — `FirstOrDefaultAsync`, **no `.Include`**. Comment
        why (FR-7 / B-14: do not pull photo data-URLs to rename a space) so it isn't
        "simplified" into `GetByIdAsync`.
      - `CountZonesAsync` / `CountItemsAsync` — `.Select(s => (int?)s.Zones.Count)` /
        `.Select(s => (int?)s.Items.Count)` → `FirstOrDefaultAsync`. Projects to a
        `COUNT(*)`; no zone/item/photo column leaves SQL (same discipline as
        `GetItemCountsPerSpaceAsync`).
      - `GetZoneAsync` / `GetItemAsync` —
        `.SelectMany(s => s.Zones).FirstOrDefaultAsync(z => z.Id == zoneId)`
        (`Zone`/`Item` have no `Space` navigation, so reach them through `Spaces`).
        **Deliberately tracked — do not add `AsNoTracking()`**: the handler mutates and
        `SaveChangesAsync`. Comment it so a reviewer doesn't "optimise" it.
      - `ZoneExistsInSpaceAsync` — `.SelectMany(s => s.Zones).AnyAsync(z => z.Id == zoneId)`.
      🔒 blocked by: T-5
- [x] **T-16** 🔴 ⛔ implement the write half of T-5 in
      `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs`:
      - `AddZoneWithinCapAsync` / `AddItemWithinCapAsync` — **model on
        `AddWithinSpaceCapAsync` line-for-line**: `BeginTransactionAsync` →
        `sp_getapplock` on `tidansu:space-content:{HashForLock(spaceId)}` (reuse the
        existing SHA-256 helper; see T-29) → capture the RETURN code via
        **`ToListAsync()`** → negative ⇒ `LogError` + rollback + `throw
        InvalidOperationException` (**never** `PlanLimitException`) → authoritative
        **owner-scoped** in-lock re-count (`CountZonesAsync`-shaped query; `null` ⇒
        rollback + `SpaceNotFound`) → `>= cap` ⇒ rollback + `AtCap` → `Add` +
        `SaveChangesAsync` + `CommitAsync` ⇒ `Inserted`. Copy D-4's comment block
        (RETURN-code capture, `ToListAsync` non-composability, `EnableRetryOnFailure`
        caveat, fail-closed, one-resource-per-transaction ⇒ no deadlock).
      - `AddZoneAsync` / `AddItemAsync` — unlimited path, **no lock, no transaction**;
        verify ownership via an owner-scoped `AnyAsync` first, then `Add` +
        `SaveChangesAsync`.
      - `RemoveZoneWithItemsAsync` — one explicit transaction:
        (1) resolve the zone owner-scoped (`null` ⇒ `false`);
        (2) **`dbContext.Set<Item>().Where(i => i.SpaceId == zone.SpaceId && i.ZoneId == zoneId).ExecuteDeleteAsync(ct)`**
        — set-based on purpose. **Do not load the items to remove them**: that
        materialises every photo data-URL in the zone, which is the exact amplification
        this task exists to delete. `ExecuteDeleteAsync` bypasses the change tracker and
        does not participate in `SaveChanges`, hence the explicit transaction;
        (3) `dbContext.Set<Zone>().Remove(zone)` + `SaveChangesAsync`; (4) commit.
        Comment (2) heavily.
      - `RemoveItemAsync` — owner-scoped resolve → `Remove` → `SaveChangesAsync`.
      🔒 blocked by: T-3, T-15
- [x] **T-17** 🟠 ⛔ ✅ **done** (applied inline by the orchestrator — a pure deletion of
      dead code: `grep -rn "ReplaceAsync" src/` showed zero callers before removal, and
      zero occurrences after; `dotnet build` green, 0 warnings). This retires the
      delete-all/re-insert path that B-15 exists to eliminate.
      delete `ReplaceAsync` from
      `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs` **and** its
      declaration + XML doc from `src/Tidansu.Domain/Repositories/ISpacesRepository.cs`
      (FR-13 / closed decision 1). Verify no caller remains
      (`Grep "ReplaceAsync" src/`). `SpacesRepository` is already registered in
      `Infrastructure/Extensions/ServiceCollectionExtensions.cs` — **no registration
      change is needed** (no new repository type).
      🔒 blocked by: T-14, T-16

### Backend — API

- [x] **T-18** 🟠 ⛔ modify `src/Tidansu.API/Controllers/SpacesController.cs`:
      - **remove** the `UpdateSpace` action and its `using ...Commands.UpdateSpace;` (FR-13).
      - **add** `UpdateSpaceFields([FromRoute] string id, [FromBody] SpaceFieldsDto fields)`
        → **`PUT /api/spaces/{id}/fields`** (D-6 / OQ-2 — **not** `PATCH /api/spaces/{id}`;
        an earlier draft of this plan said PATCH and was overruled at the gate) →
        `mediator.Send(new UpdateSpaceFieldsCommand {...})`. `[ProducesResponseType]`
        200/400/404. **No `[RequestSizeLimit]`** — the body carries no photo.
        `CreateSpace`'s 24 MB limit stays as is (space create is out of scope).
        The route is `[HttpPut("{id}/fields")]` on the existing `api/spaces` controller
        route — keep the space segment spelled `{id}` (D-6, Kiota indexer collision).
      🔒 blocked by: T-12, T-14
- [x] **T-19** 🟠 ⛔ add `src/Tidansu.API/Controllers/SpaceZonesController.cs` —
      `[ApiController] [Authorize] [Route("api/spaces/{id}/zones")]` — with `POST` /
      `PUT {zoneId}` / `DELETE {zoneId}`, each a single `mediator.Send(...)` and nothing
      else. Route param **must** be `{id}` for the space segment (D-6, Kiota indexer
      collision). No `[RequestSizeLimit]` (zones carry no photo).
      🔒 blocked by: T-13
- [x] **T-20** 🟠 ⛔ add `src/Tidansu.API/Controllers/SpaceItemsController.cs` —
      `[Route("api/spaces/{id}/items")]` — with `POST` / `PUT {itemId}` /
      `DELETE {itemId}`. Put **`[RequestSizeLimit(8 * 1024 * 1024)]`** on `POST` and
      `PUT` (one photo: ≤5 MB raw ≈ 6.99 MB base64 + headroom; well under Kestrel's
      ~28.6 MB default, so it binds). `[ProducesResponseType]` 200/400/403/404/413.
      `ErrorHandlingMiddleware` **already** catches `BadHttpRequestException` and
      surfaces its real 4xx (verified at plan time — B-13 landed it), so 413 works with
      no middleware change.
      🔒 blocked by: T-13

### Frontend — API client

- [x] **T-21** 🟠 **regenerate the Kiota client** — `npm run build:api` from
      `src/Tidansu.App`, after a fresh `dotnet build` of the API so the swagger DLL is
      current. Never hand-edit `src/Tidansu.App/src/api/apiClient/`.
      **⚠️ `build:api` is known-broken in this repo** (tracked as B-21): the
      `swagger tofile` step always fails with *"A type named 'Startup' could not be
      found"* — structural (minimal hosting, there is no `Startup` class), **not**
      version drift. Do not burn time re-pinning tool versions. Use the documented
      fallback (run the API with an empty `ConnectionStrings__TidansuDb` so it skips
      `Database.Migrate()`, `curl` the doc from the running app, then run
      `fix-openapi.mjs` → `kiota generate` → `fix-generated.mjs` by hand). Requires the
      global tools `Swashbuckle.AspNetCore.Cli` (**version-matched to the API's
      Swashbuckle — 10.2.3**) and `Microsoft.OpenApi.Kiota` on PATH (`~/.dotnet/tools`).
      **Verify after regen:** `.byId(x).put` is **gone** (the retired whole-space PUT) and
      `.byId(x).fields.put`, `.byId(x).zones.byZoneId(y)`, `.byId(x).items.byItemId(y)`
      exist. Note `.byId(x).fields.put` — **not** `.byId(x).patch` (D-6/OQ-2; an earlier
      draft of this plan expected a `.patch` node on the space itself). `.byId(x)` keeps a
      `put` on its **`fields`** child, not on the space node.
      🔒 blocked by: T-18, T-19, T-20

### Frontend — Composables/Stores

- [x] **T-22** 🟢 modify `src/Tidansu.App/src/api/spaceMapping.ts`: add
      `toZoneDtoBody(zone)`, `toItemDtoBody(item)`, `toSpaceFieldsBody(space)`, and
      export `toZone` + a new `toItem` (lifted from the inline mapper inside `toSpace`'s
      `items.map(...)`) so the single-entity responses and `toSpace` share one
      implementation. Keep `toSpace`/`toDtoBody` (still used by space create/hydrate).
      🔒 blocked by: T-21
- [x] **T-23** 🟠 modify `src/Tidansu.App/src/composables/useSpacesApi.ts`:
      **remove** `update(space)`; add **`updateFields(spaceId, space)`** (D-6/OQ-2 — the
      name is `updateFields`, **not** `patchFields`; it calls
      `client.api.spaces.byId(spaceId).fields.put(...)`), `addZone(spaceId, zone)`,
      `updateZone(spaceId, zone)`, `removeZone(spaceId, zoneId)`, `addItem(spaceId, item)`,
      `updateItem(spaceId, item)`, `removeItem(spaceId, itemId)`. Keep `list`/`create`/
      `remove` and `planReasonOf` unchanged (`planReasonOf` already reads
      `additionalData.errors.plan` — the 403 body shape is unchanged, so the paywall
      wiring is preserved for free).
      🔒 blocked by: T-22
- [x] **T-24** 🟠 add `src/Tidansu.App/src/data/pendingChanges.ts` — a **pure** module
      (no Vue, no network, no transport DTOs) owning the coalescing rules. **Shape decided
      by the OQ-4 `design-an-interface` exploration** (4 designs; this is the
      "common-case" design plus the reducer design's purity discipline). The store gets
      depth without learning the rules.

      **Why this shape (do not re-litigate).** A census of `useSpacesStore.ts` found 11
      `scheduleSave` call sites. `updateItem`/`updateZone` are only 2 of them — but they
      are the ones fired *repeatedly within a single window* (every rename, quantity/
      expiry edit, zone drag). So the hot path gets the ergonomics and the rare cases get
      escape hatches.

      ```ts
      export type EntityKind = 'space' | 'zone' | 'item';
      export type PendingOp = 'add' | 'update' | 'delete';

      export interface ChangeSet { /* opaque — mutate only via the functions below */ }
      export function createChangeSet(): ChangeSet;
      export function isEmpty(set: ChangeSet): boolean;

      // THE COMMON CASE — a one-for-one swap for today's `Object.assign(entity, patch)`.
      // Captures the snapshot on first touch this window and coalesces repeats.
      export function stageUpdate<T extends { id: string }>(
          set: ChangeSet, kind: EntityKind, entity: T, patch: Partial<T>): void;

      // Escape hatch for updates that are not a flat patch (convertToFreeform's
      // flowFreeform fan-out): snapshot first, then let the algorithm mutate.
      export function snapshotForUpdate<T extends { id: string }>(
          set: ChangeSet, kind: EntityKind, entity: T): void;

      export function stageAdd<T extends { id: string }>(set: ChangeSet, kind: EntityKind, entity: T): void;
      export function stageDelete<T extends { id: string }>(set: ChangeSet, kind: EntityKind, entity: T): void;

      // Rare + deliberately the most verbose call: the store gathers itemsInZone itself.
      // Absorbs the old `dropZoneChildren` — it is NOT a separate export.
      export function stageZoneDelete(set: ChangeSet, zone: Zone, itemsInZone: Item[]): void;

      export interface FlushOperation<T> {
          readonly kind: EntityKind;
          readonly id: string;
          readonly op: PendingOp;
          readonly payload: T | undefined;   // undefined for 'delete'
          readonly snapshot: T | null;       // null for 'add'
          readonly cascaded?: Item[];        // zone 'delete' only
      }
      export interface FlushPlan {
          readonly phase1: { space: FlushOperation<Space> | null; zones: FlushOperation<Zone>[] };
          readonly phase2: { items: FlushOperation<Item>[]; zoneDeletes: FlushOperation<Zone>[] };
      }
      // Takes the window and installs a fresh empty ChangeSet for the next one.
      export function takeFlushPlan(set: ChangeSet): FlushPlan;

      // One call regardless of add/update/delete/cascade shape.
      export function applyRollback(space: Space, op: FlushOperation<Space | Zone | Item>): void;
      ```

      **Two structural properties that are the point of this design — preserve them:**
      1. **`stageUpdate` takes the snapshot itself**, so a developer adding a new edit
         action later *cannot* forget to snapshot pre-mutation. The old sketch made the
         caller capture it, which is the single easiest way to silently break rollback
         (snapshot *after* mutating → "restores" the already-mutated value). The module
         owns it now; do not push it back to the call site.
      2. **Every `FlushOperation` is self-contained** — it carries its own `payload`,
         `snapshot` and `cascaded`. Rollback therefore needs **no** second lookup into a
         `ChangeSet` that `takeFlushPlan` has already cleared.

      **Purity discipline** (from the rejected reducer design, worth keeping): `ChangeSet`
      is a plain value and these are pure functions over it. The payoff is concrete —
      every coalescing rule below is a ~3-line unit test with no mocks, no fake timers, no
      Vue test utils. That matters *because* this repo has no frontend test coverage.

      **Coalescing rules** (AC: "rapid successive edits do not lose or duplicate entities"):
      | existing | incoming | result |
      |---|---|---|
      | — | any | record; `snapshot` = the last **server-known** state (`null` for `add`) |
      | `add` | `update` | stays `add` (the add sends current state anyway) |
      | `add` | `delete` | **drop the entry entirely** — it never existed server-side |
      | `update` | `update` | stays `update`; **keep the original snapshot** (earliest wins) |
      | `update` | `delete` | becomes `delete`; keep the original snapshot so a failed delete can restore |

      Plus: **`stageZoneDelete` drops every pending change for items in that zone** — the
      server cascade (FR-3) handles the existing ones, and pending item-adds in a deleted
      zone must never be sent. The zone-delete op carries `cascaded: Item[]` (the items
      removed locally) so a failed zone delete restores the zone **and** its items.

      **Rejected alternatives** (one line each so they are not reopened):
      - *Minimal `flush()`/`resolve()` alternating protocol* — smallest surface, but
        calling `flush()` twice without `resolve()` breaks the D-7 zone ordering with **no
        type error**. Unacceptable with no tests to catch the misuse.
      - *Full immutable reducer* — best testability, but an O(pending) Map copy per
        keystroke and the most verbose call sites.
      - *Diff-at-flush* (shadow the last server-known state, derive ops by diffing) — the
        agent assigned to argue **for** it returned a negative result. Two findings worth
        keeping: (a) the "shadowing photos doubles memory" objection is **false** — JS
        strings are immutable, so a shallow `{...item}` clone shares the same string
        object until an edit reassigns `photo`; the real disqualifiers are that
        shadow-seeding is a silent correctness trap (seed at the wrong moment and edits
        vanish) and the diff scans every zone/item per window — unbounded on exactly the
        Pro-with-photos tier; and (b) diffing does **not** eliminate the zone-cascade
        rule, it only relocates it. This record-operations shape was independently
        converged on by the exploration — do not reopen it.
- [x] **T-25** 🔴 rewrite the save path in `src/Tidansu.App/src/stores/useSpacesStore.ts`
      (FR-11 + closed decision 2). This is the highest-risk frontend task.
      - **Keep one debounce timer per space** (the existing `saveTimers` map, 400 ms).
        Closed decision 2: **not** independent per-entity timers. Every existing action
        keeps calling `scheduleSave(spaceId)` — but each now also stages *what* changed
        via T-24's `stageUpdate`/`stageAdd`/`stageDelete`/`stageZoneDelete`. **The module
        captures the snapshot itself** (T-24 property 1) — `stageUpdate(cs, 'item', item,
        patch)` replaces today's `Object.assign(item, patch)` one-for-one at the call
        site. Do not hand-capture snapshots in the store.
      - `scheduleSave` fires `flush(spaceId)` instead of `api.update(space)`.
      - **`flush` is two-phase** (D-7 — a zone must exist server-side before an item
        references it):
        - *phase 1* (parallel, `Promise.allSettled`): space-scalar `updateFields` + all
          zone `add`/`update`.
        - *phase 2* (parallel, after phase 1 settles): all item `add`/`update`/`delete`
          + all zone `delete`.
        - **BUG 1 — the phase-2 drop rule (D-7).** After phase 1 settles, drop **every
          phase-2 item op whose target `zoneId` is a zone whose phase-1 `add` failed** —
          `add` **and** reassigning `update` alike (FR-5 lets an update move an item into
          a zone created in the same window). Mark each dropped op `failed`; do not send
          it. "Target `zoneId`" = the zone the item lives in *after* the op (the payload's
          `zoneId`). An `update` that stays in an existing server-known zone is
          unaffected; item-`delete` is **never** dropped. An earlier draft of this plan
          covered only `add` — that was the bug.
      - **BUG 2 — serialize flushes per space (SC-9).** The 400 ms debounce delays a
        flush's *start*, not its *duration*: edits arriving while a flush's requests are
        in flight open a second window, and two flushes for one space could otherwise
        overlap — letting a stale rollback from flush #1 stomp a newer optimistic edit
        from flush #2. **Decided mechanism (chosen at the gate over per-entity generation
        stamps): if a flush is already in flight for that space, do not start another —
        re-arm the debounce and let the next window absorb the new edits.**

        ```ts
        const inFlight = new Set<string>();
        async function flush(spaceId: string): Promise<void> {
            if (inFlight.has(spaceId)) { scheduleSave(spaceId); return; } // fold into next window
            inFlight.add(spaceId);
            try { /* ...two-phase flush... */ }
            finally { inFlight.delete(spaceId); }
        }
        ```

        Rationale to keep in the code comment: this makes the overlap **structurally
        impossible** rather than detecting it after the fact. Generation stamps were
        rejected — more concurrency, but they add per-entity bookkeeping whose failure
        mode (one missed stamp check) is silent, and there is no frontend test coverage to
        catch it. The `finally` is load-bearing: an early `return` or a throw that skips
        `inFlight.delete` wedges that space's autosave permanently.
      - **`handleSyncError` must stop calling `hydrate(true)`.** Today a single 403
        re-syncs the whole account, which would *"re-fetch away"* the sibling edits FR-11
        exists to protect. Replace with **per-entity rollback**: `add` → remove the
        entity locally; `update` → restore `snapshot`; `delete` → re-insert `snapshot`
        (and `cascaded` items for a zone). Then `openPaywall(reason)` when
        `planReasonOf(error)` is non-null, as today.
      - **Expose per-mutation state** (FR-11, consumed by B-19, **not rendered here**):
        `saveState: Ref<Map<string, { status: 'pending' | 'saved' | 'failed'; reason: PaywallReason | null }>>`,
        keyed by entity id plus `space:{id}` for the scalars. Add it to the store's
        return object.
      - `reset()` must clear `saveState`, the `ChangeSet` map and `inFlight` alongside
        `saveTimers`.
      - **Action signatures and getters must not change** — no view touches this task
        (`renameSpace`, `setViewMode`, `convertToFreeform` → scalar change, the last via
        `snapshotForUpdate` + `flowFreeform`; `addItemSmart`/`addItemStructured`/
        `updateItem`/`removeItem` → item change; `addZoneColumn`/`addZoneFree`/
        `updateZone` → zone change; `deleteZone` → `stageZoneDelete` (which absorbs the
        old `dropZoneChildren`); `addSpace`/`duplicateSpace`/`deleteSpace`/`hydrate`
        **unchanged** — still whole-space `POST`/`DELETE`).
      🔒 blocked by: T-23, T-24

### Frontend — Components/Views

- [x] **T-26** 🟢 ✅ **verified — no component or view work was needed, as predicted.**
      5 `.vue` files reference `useSpacesStore`; **none** references `api.update` or any
      removed store internal (`grep -rln "api\.update\|\.update(space)" --include=*.vue`
      → no matches). T-25 preserved every action signature, so the check that "if any
      `.vue` needs a change, T-25 broke a signature" came back clean.
      **no component or view work.** T-25 preserves every store action
      signature and getter, and FR-11's per-mutation state is *exposed*, not rendered
      (B-19 owns that surface). Confirm by `Grep`ping for `useSpacesStore` call sites and
      checking none reference `api.update` or the removed store internals. If any `.vue`
      file needs a change, **stop** — it means T-25 broke a signature.
      🔒 blocked by: T-25

### Refactoring

- [x] **T-27** `[refactor]` 🟢 ✅ **done via T-9, verified**: one private
      `MessageForInvalid(string? photo)` core with exactly two callers —
      `ThrowIfInvalid(SpaceDto)` (CreateSpace, unchanged behaviour) and
      `ThrowIfInvalid(string? photo, string errorKey)` (the granular path). No second
      copy of the rejection→message mapping exists.
      `src/Tidansu.Application/Spaces/Dtos/SpacePhotoGuard.cs` —
      DRY: T-9's extraction is the refactor. The `SpaceDto` loop and the single-item path
      must share one core; two copies of the photo-rejection→message mapping is exactly
      how B-13's ordering guarantee would drift. (Folded into T-9; listed here so the
      reviewer sees it was considered.)
- [x] **T-28** `[refactor]` 🟢 `src/Tidansu.App/src/api/spaceMapping.ts` — DRY: the item
      mapper is currently inlined inside `toSpace`'s `.map(...)`. T-22 lifts it to a named
      `toItem` shared by `toSpace` and the new single-item responses. Do not duplicate it.
- [x] **T-29** `[refactor]` 🟢 ✅ **done inside the T-15/T-16 run** (the rename was needed
      the moment `HashForLock` started hashing space ids; all 3 call sites use it and the
      64-char/255-char comment survived, with a note recording the old name).
      `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs` —
      rename `HashUserIdForLock` → `HashForLock` (it hashes space ids too after T-16) and
      keep its comment about the fixed 64-char width vs `sp_getapplock`'s 255-char
      `@Resource` bound. Update `AddWithinSpaceCapAsync`'s call site.
- [x] **T-30** `[refactor]` 🟢 `src/Tidansu.App/src/stores/useSpacesStore.ts` — the
      doc-comment on the store still says *"edits are debounced into a whole-space `PUT`"*
      and `scheduleSave`'s says *"Debounced whole-space PUT"*. Both are false after T-25.
      Update them to describe the batched-window/per-entity-request model (closed
      decision 2) — a stale comment on the file that *was* the slow path is the single
      most misleading line in the diff.

**Scope note:** `DeleteSpaceCommandHandler` still uses `GetByIdAsync` (which `.Include`s
Items, i.e. loads every photo just to delete them). Real, but **out of scope** — space
delete is explicitly untouched by this task (FR-13 constraints), and photo transport is
B-16's. Not planned here; noted so it isn't mistaken for an oversight.

### Verification

- [x] **T-31** 🟢 ✅ **green — 0 errors, 0 warnings** (whole solution), and the stub
      assertion below passes: `grep -c "NotImplementedException" …/SpacesRepository.cs`
      → **0**. `dotnet build` from `src/Tidansu.API` — green.
      **Also assert the temporary stubs are gone** (see the warning above T-15):
      `grep -c "NotImplementedException" src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs`
      **must return 0**. A green build does **not** prove this — a throwing stub compiles
      perfectly and only fails at runtime, as a 500, once T-13's handlers reach it.
      🔒 blocked by: T-20
- [x] **T-32** 🔴 ⛔ ✅ **satisfied, and the ordering requirement was honoured.** The
      equivalence theory **did** run green *before* T-8 deleted what it checked against:
      it passed at **321/321** with the range widened to 0..60 (straddling both Free caps
      — zones 6 **and** items 50). That widening was itself a fix: the original 0..10
      range never reached the items cap, so the item half of the proof passed **vacuously**
      while appearing green. `dotnet test` now → **62/62 passing, 0 failed**; the drop
      321→62 is exactly the 259 cases T-8 removed with `CheckSpaceMutation` (14 + 244 + 1)
      and is correct, not a regression.
      `dotnet test` — green, **with T-6's equivalence theory passing
      before T-8 removes it**. This is the repo's only automated proof that FR-8's
      decomposition preserves the cap.
      🔒 blocked by: T-6
- [x] **T-33** 🟢 ✅ **green — 0 type errors, vite build succeeded.** It *did* fail loudly
      first on the removed `.byId(x).put` / `api.update`, exactly as this task predicted —
      that failure was the proof T-21's regen took, and T-25 cleared it. Also green:
      **vitest 17/17** on `pendingChanges.ts` (the runner added at the gate — see §4).
      `npm run build` from `src/Tidansu.App` (vue-tsc type-check) — green.
      Expect it to fail loudly at first on the removed `.byId(x).put` — that failure is
      the check that T-21's regen actually took.
      🔒 blocked by: T-25
- [x] **T-34** 🔴 ⛔ ✅ **DRIVEN — all 12 steps pass.** Run against the real app on LocalDB
      with the EF SQL log on (2026-07-16). Evidence per step below; the SQL-provable ones
      were read from the log, not from the screen.

      **1 · The motivating case — the headline AC, proven in SQL.** Renaming one item in
      a 5-item space (one carrying a photo) emitted exactly:
      `UPDATE [Item] SET [Name] = @p0 OUTPUT 1 WHERE [Id] = @p1;` — **one row, one
      column**. Across the whole run: `DELETE FROM [Item]` = **0**, `DELETE FROM [Zone]`
      = **0**, and the `Photo` column appears in **no** UPDATE (EF's change detection saw
      the resent identical blob as unchanged). The old `ReplaceAsync` would have issued
      ~5 item DELETEs + ~2 zone DELETEs + ~7 re-INSERTs and rewritten the photo.
      **2 · Scalars.** `PUT /fields` → 200, response is `SpaceFieldsDto` (no zones/items
      keys), rename persisted, zones/items untouched.
      **3 · Zone cascade — set-based, as SC-2 requires.** Deleting a zone holding 3 items
      emitted ONE statement: `DELETE FROM [i] FROM [Item] AS [i] WHERE [i].[SpaceId] =
      @zone_SpaceId AND [i].[ZoneId] = @__locals1_zoneId` — not 3 parameterised deletes,
      and no SELECT pulling their photos. Then one `DELETE FROM [Zone]`.
      **4 · Caps.** 50 item-adds → all 200; 51st → **403 `{"plan":["items"]}`**, count
      stays 50 (no mutation on rejection); delete one → re-add succeeds (not a one-way
      door). Zone cap likewise 403 `zones`.
      **5 · Downgrade / read-only — the step most likely to be broken. ALL PASS.** With
      10 zones on Free (cap 6): rename zone → **200**; delete zone → **204**; rename a
      **photo-bearing** item → **200** (proves `PhotoChangeBetween` returns `None` for an
      identical resent photo — had this 403'd, downgraded users' photo items would be
      permanently uneditable); remove photo → **200**; add an 11th zone → **403
      `zones`**. This is D-1's "updates/deletes get no gate call" holding in production.
      **6 · Photo ordering (B-13 D-8.2).** Free + a *valid* photo → **403 `photos`**.
      Free + an *invalid* photo → **still 403 `photos`, never the guard's 400** — the
      exact invariant the unsplittable T-9+T-13d+T-13e batch existed to protect.
      **7 · Partial failure (FR-11).** Store-level (see note). Rename A + add B in one
      window, B trips the cap: paywall opens for B, B is rolled back, **A's rename
      survives**, and `api.list` is never called (the old `hydrate(true)` re-sync would
      have re-fetched A's edit away).
      **8 · Ownership (FR-10).** Cross-user id and unknown id both → **404** with a
      byte-identical message *shape*; the only difference is the id the **caller
      supplied**, so neither response reveals existence. A's data unchanged after B's
      attempts.
      **9 · Concurrency race (FR-9) — the lock works.** Two genuinely concurrent
      `POST .../zones` at 5/6 zones → **exactly one 200 and one 403 `zones`** (not a
      500), final count **exactly 6, never 7**.
      **10 · Non-regression.** Space create/delete fine; B-14 usage meters still correct
      after granular adds.
      **11 · BUG 1 — the reassigning-update drop rule.** A failed phase-1 zone-add drops
      **both** the item-add targeting it **and** the FR-5 update reassigning into it —
      neither request is sent. An update staying in an existing zone is unaffected.
      **12 · BUG 2 — flush serialization.** An edit arriving mid-flight starts no second
      overlapping flush and is absorbed by the next window (not lost); the in-flight
      guard releases after a failure.

      **Note on steps 7/11/12 — how they were proven, and why not by hand.** These three
      live in the store's `flush()` orchestration, not in the API, so curl + the SQL log
      cannot reach them. Each also needs a specific interleaving inside a 400 ms debounce
      window, which hand-driving a browser cannot hit reliably. They are proven instead by
      `src/Tidansu.App/src/stores/useSpacesStore.flush.test.ts` (6 tests, mocked API
      boundary, fake timers) — deterministic and repeatable. **Both bug fixes were
      mutation-tested to prove the tests have teeth:** reverting the drop rule to add-only
      (the original plan's bug) makes T-34.11 **fail**; deleting the `finally` makes
      T-34.12c **fail**. Both restored, all green. This extends the vitest scope agreed at
      the §4 gate (which said "T-24 only") by one file — done deliberately, because
      otherwise B-15's two most dangerous fixes would ship never having been executed.

      **A pre-existing warning observed (not a B-15 regression):** EF logs *"Savepoints
      are disabled because MARS is enabled"* whenever `SaveChanges` runs inside an
      explicit transaction — MARS is in the dev connection string, and B-12's existing
      lock path already triggers it. Benign here: nothing retries `SaveChanges`, and
      `await using var transaction` rolls back on failure.

      **manual end-to-end drive** (`/run` then `/verify`). No integration
      or E2E suite exists — this is the only place the acceptance criteria are proven.
      **Turn on the dev-only EF SQL log and read it** — the headline acceptance criterion
      is about *which SQL runs*, and it cannot be proven by observing correct numbers on
      screen (a delete-all/re-insert also produces correct numbers).

      1. **Happy path / the motivating case.** Open a space with ≥5 items, ≥1 with a
         photo. Rename one item. **Observe in the SQL log:** exactly one
         `UPDATE Items SET Name = ... WHERE Id = ...`. **No** `DELETE FROM Zones/Items`.
         **No** `UPDATE ... SET Photo` on any row (EF's change detection sees the
         resent photo string as unchanged). Reload → the rename persisted.
      2. **Space scalars (FR-7).** Rename the space, then switch columns → freeform.
         **Observe:** a single `UPDATE Spaces` per flush; **no** `SELECT` of any zone or
         item row (proves `GetByIdWithoutContentAsync`, not `GetByIdAsync`); **no**
         zone/item write for the rename. Note freeform conversion *does* also write each
         zone's rect — expected (see SC-3).
      3. **Zone cascade (FR-3).** Delete a zone holding 3 items. **Observe:** one
         set-based `DELETE FROM Items WHERE SpaceId = ... AND ZoneId = ...` (**not** 3
         parameterised deletes, and no `SELECT` pulling those items' photos), then one
         `DELETE FROM Zones`. Reload → zone gone, all 3 items gone, both counts correct.
      4. **Plan-cap path (FR-1/FR-4).** As Free: 6-zone space → add a 7th → paywall opens
         with `reason: zones`, no zone appears, reload confirms 6. 50-item space → add a
         51st → paywall `reason: items`. Remove one, add again → succeeds.
      5. **Downgrade / read-only path (FR-8) — the one most likely to be broken.**
         Get a space to 8 zones on Pro, downgrade to Free. Then: **rename** a zone → must
         **succeed**. **Delete** a zone → must **succeed**. **Rename an item that has a
         photo** → must **succeed** (this is D-2 rule 1; if this 403s, `PhotoChangeBetween`
         is comparing wrong). **Remove** a photo → must **succeed**. **Add** a 9th zone →
         must be **rejected**, `reason: zones`.
      6. **Photos ordering (FR-12).** As **Free**, attach an *oversized/non-image* photo
         to an item → must get **403 `reason: photos`**, never the 400. As **Pro**, attach
         the same → **400** naming `item.photo`; the item's other fields unchanged; check
         the server log contains **no** photo data.
      7. **Partial failure (FR-11's AC).** Free space at 50/50 items. In one debounce
         window: rename item A **and** add item B. After both settle → paywall opened for
         B (`reason: items`); B does not exist; **reload → A's rename is present**; no
         other item or zone reverted. (If A's rename is gone, `handleSyncError` is still
         calling `hydrate(true)`.)
      8. **Ownership (FR-10).** With two accounts, `curl` a
         `PUT /api/spaces/{ownSpaceId}/items/{otherUsersItemId}` and a
         `PUT /api/spaces/{ownSpaceId}/items/{randomGuid}` → **byte-identical 404 bodies**.
         Confirm no row changed in either.
      9. **Concurrency (FR-9).** Free space at 49/50 items. Fire two `POST .../items`
         **simultaneously** (`curl ... & curl ... &`). → **exactly one** success and one
         **403 `reason: items`** (not a 500, not a bespoke message). Query the DB:
         exactly 50 items. Repeat for zones at 5/6.
      10. **Non-regression (FR-13 AC).** Create a space, duplicate it, delete it; boot
          hydrate; account page usage meters (B-14) still correct after granular
          adds/deletes.
      11. **BUG 1 — the phase-2 drop rule covers reassigning updates (D-7/SC-6).** Force a
          phase-1 zone-add failure as **Free at the 6-zone cap**: in **one** debounce
          window, (a) add a 7th zone Z, (b) add a new item into Z, **and** (c) drag an
          **existing** item from another zone into Z (an FR-5 reassigning update).
          **Expect:** paywall `reason: zones`; Z does not appear; **both** (b) and (c) are
          dropped and marked `failed` — **neither is sent**. Confirm in the **network tab**
          that no `POST .../items` and **no `PUT .../items/{id}` carrying Z's `zoneId`**
          left the client. The existing item stays in its original zone after reload.
          *This is the exact case an earlier draft got wrong — (c) would have been sent
          and 404'd. If you see a request for (c), the drop rule is still add-only.*
      12. **BUG 2 — flushes serialize per space (SC-9).** Throttle the network (DevTools
          "Slow 3G") so a flush's requests stay in flight past 400 ms. Type a rename into
          an item, and **keep editing** it (and a second item) while the first flush is
          still pending. **Expect:** no two flushes for that space overlap — in the network
          tab, the second batch does not start until the first has fully settled; **no
          edit is lost or reverted**; the final state after reload matches the last thing
          typed. Then confirm the **`finally` releases**: after everything settles, make
          one more edit → it must still save (if it never sends, the space id is wedged in
          the in-flight set — the one way this fix is worse than the bug).
      🔒 blocked by: T-31, T-32, T-33

---

## 2. 🔒 Security Considerations

- **🔴 Critical — cross-user zone/item mutation via a guessed or leaked id (FR-10).**
  Per-entity ids become the primary way the server locates data to mutate; N ownership
  checks replace 1, and one miss is a direct cross-account read/write.
  - [ ] Enforce structurally, not by discipline: **no `ISpacesRepository` method reaches
        a zone/item without `(spaceId, entityId, userId)`** (T-5, T-15, T-16). Every
        query roots at `Spaces.Where(s => s.Id == spaceId && s.UserId == userId)`.
  - [ ] `Grep` the final diff for any new `dbContext.Set<Zone>()` / `Set<Item>()` query
        that does not join through `Spaces` with a `UserId` predicate. There should be
        exactly one exception: `RemoveZoneWithItemsAsync`'s `ExecuteDeleteAsync`, whose
        `SpaceId` comes from an **already owner-resolved** zone — comment that.
  - [ ] Verify T-34.8 (identical 404 for other-user and unknown ids).

- **🔴 Critical — information disclosure via distinguishable responses (FR-10).**
  A `403`/`404` split would confirm an id exists in another account.
  - [ ] **No `ForbidException` on any granular path.** Unknown and cross-user both flow
        through the *same* `null` → `NotFoundException` branch, so they cannot diverge.

- **🟠 High — plan-gate bypass by decomposition gap (FR-8).** A sequence of small adds
  slipping past a limit the whole-space edit would have caught = a paying-fairness bug.
  - [ ] T-6's equivalence theory (`CheckAddZone(plan,n) == CheckSpaceMutation(plan, n, n+1)`)
        must be green before T-8 deletes the rule it is checked against.
  - [ ] Gate **before** any tracked-state mutation, so a rejected mutation cannot
        partially apply (FR-8 constraint).

- **🟠 High — plan-gate bypass by race (FR-9).** Two concurrent adds both read under-cap.
  - [ ] The pre-check is **advisory**; the authoritative decision is the **in-lock
        re-count** inside `AddZoneWithinCapAsync` / `AddItemWithinCapAsync` (T-16).
  - [ ] **Capture `sp_getapplock`'s RETURN code.** A discarded return value falls through
        to count+insert *without the lock*, silently reopening the race — the failure mode
        looks exactly like success.
  - [ ] Verify T-34.9.

- **🟠 High — photo guard bypass / ordering inversion on the new path (FR-12).**
  B-13's "Free is blocked before content is inspected" is a trust-boundary decision.
  - [ ] Plan gate → `SpacePhotoGuard` → mutate, in that order, in **both** `AddItem` and
        `UpdateItem` (T-13d/e).
  - [ ] **No photo rule in any new FluentValidation validator** — `ValidationBehavior`
        runs before handlers, so it would return 400 and preempt the 403.
  - [ ] `PhotoChangeBetween(null, "")` must be `Added` (T-7), or `photo: ""` skips the
        gate on Free and leaks out as a 400.

- **🟡 Medium — photo content in errors or logs.**
  - [ ] `SpacePhotoGuard`'s messages stay fixed constants; the *key* carries the location
        (T-9). Handlers log ids only (T-13 rule 5).

- **🟡 Medium — oversized item bodies.**
  - [ ] `[RequestSizeLimit(8 * 1024 * 1024)]` on item `POST`/`PUT` (T-20).
        `ErrorHandlingMiddleware` already surfaces Kestrel's `BadHttpRequestException`
        as a real 413 rather than masking it as 500 — verified, no change needed.

- **🟡 Medium — lock failure misreported as a cap.**
  - [ ] A negative `sp_getapplock` return **fails closed with a 500**, never a
        `PlanLimitException` (T-16) — otherwise a transient DB condition tells an
        upgrade-eligible user they are capped.

---

## 3. 📈 Scalability / Correctness Considerations

- **SC-1 — the whole point: no granular handler may load the space graph.**
  `GetByIdAsync` `.Include`s Zones **and** Items (every `nvarchar(max)` photo). Using it
  in an add/update handler would re-introduce exactly the cost B-14 removed.
  - [ ] Adds use `CountZonesAsync`/`CountItemsAsync` (a `COUNT(*)` projection); updates
        use `GetZoneAsync`/`GetItemAsync` (one row); scalars use
        `GetByIdWithoutContentAsync` (T-15).
  - [ ] Prove it in T-34.1/34.2 via the EF SQL log, not by reading the screen.

- **SC-2 — zone-delete cascade must be set-based.** Load-then-`RemoveRange` would
  materialise every photo in the zone into memory to delete rows.
  - [ ] `ExecuteDeleteAsync` on `(SpaceId, ZoneId)` (T-16), inside an explicit
        transaction (it bypasses the change tracker and does not join `SaveChanges`).
  - [ ] The `SpaceId` FK index narrows the scan to that space's items (≤50 on Free)
        before the `ZoneId` filter. **An index on `Item.ZoneId` is deliberately not
        added** — it would require a migration (D-5) for a scan of tens of rows. If
        profiling ever shows it, that is a separate task.

- **SC-3 — `convertToFreeform` now costs N+1 requests instead of 1.** It changes the
  space's scalars *and* every zone's rect (`flowFreeform`). 6 zones on Free → 7 requests;
  a 50-zone Pro space → 51.
  - [ ] **Accept and measure.** Each request is a few hundred bytes with no photo, so
        total bytes still fall far below today's whole-graph PUT, and they parallelise in
        phase 1 (T-25). Do **not** add a bulk-zone endpoint speculatively (YAGNI — no FR
        asks for it). Note it in the PR so B-16's author sees it.

- **SC-4 — item `PUT` still carries the photo on the wire (~7 MB worst case).** The
  client sends the whole item, so a rename resends the photo.
  - [ ] **Bounded, and already a large win**: one item's photo instead of the entire
        space's photos. EF's change detection compares against the loaded original, so an
        unchanged photo produces **no** `UPDATE` of the `Photo` column (verify in
        T-34.1). Photo *transport* is **B-16's** scope. **Do not** invent a tri-state
        "omitted vs null" photo field here — it would collide with B-16 and break
        FR-5's "removing a photo" (`null` must mean remove).

- **SC-5 — lock contention per space (Free only).** A batch's zone-add + 3 item-adds
  against one space serialize on one resource.
  - [ ] Accepted (D-4): each critical section is `COUNT(*)` + one insert; the contenders
        are one user's own requests against their own space. Pro takes **no lock**.

- **SC-6 — flush ordering correctness (D-7). BUG 1 — found by the OQ-4 exploration.** An
  item op landing before the zone it references now 404s (the zone-existence check is new).
  - [ ] Two-phase flush (T-25). Ordering itself already holds — all zone-adds are phase 1,
        all item ops phase 2 — so the bug was never ordering; it was the **drop rule**.
  - [ ] **The drop rule must cover reassigning updates, not just adds.** After phase 1
        settles, drop every phase-2 item op whose **target `zoneId`** (the payload's, i.e.
        where the item lands *after* the op) belongs to a zone whose phase-1 `add` failed —
        `add` **and** FR-5 reassigning `update` alike. Mark dropped ops `failed`; do not
        send them. An earlier draft covered only `add`; an update reassigning an item into
        a same-window zone whose add failed would have been sent and broken.
  - [ ] Item-`delete` is **never** dropped (the item may exist server-side from an earlier
        window). An `update` staying in an existing server-known zone is unaffected.
  - [ ] Prove in T-34 (drive a failed zone-add with both an item-add *and* an item-update
        reassigning into it, in one window).

- **SC-7 — pending-change coalescing must not lose or duplicate entities** (AC:
  "rapid successive edits do not lose or duplicate entities").
  - [ ] `add`+`delete` → send nothing; `update`+`update` → keep the **earliest** snapshot
        (or a failed rollback restores a mid-edit value, not the server value);
        `stageZoneDelete` drops pending item changes in that zone (T-24).

- **SC-8 — `AsNoTracking` is deliberately absent** from `GetZoneAsync`/`GetItemAsync`.
  - [ ] Comment it (T-15). They are mutated and saved; adding `AsNoTracking` would make
        every update silently a no-op — a plausible "optimisation" a reviewer might
        suggest.

- **SC-9 — overlapping flush windows (data loss on the autosave path). BUG 2 — found by
  the OQ-4 exploration** (two designs found it independently; an earlier draft of this
  plan did not address it at all). The 400 ms debounce delays a flush's **start**, not its
  **duration**. Edits arriving while a flush's requests are still in flight open a second
  window, so two flushes for the same space can be in flight at once — and a stale
  rollback from flush #1 can stomp a newer optimistic edit from flush #2. That is
  silent user-data loss, and it directly undercuts FR-11 (the requirement that a failure
  must not take sibling edits down with it).
  - [ ] **Decided at the gate: serialize flushes per space.** If a flush is in flight for
        that space, do not start another — re-arm the debounce (`scheduleSave(spaceId)`)
        and let the next window absorb the new edits. `Set<string>` of in-flight space ids
        + `try/finally` (T-25 carries the sketch). This makes the overlap **structurally
        impossible** rather than detected after the fact.
  - [ ] **Per-entity generation stamps were rejected**: more concurrency, but per-entity
        bookkeeping whose failure mode (one missed stamp check) is silent, in a repo with
        no frontend test coverage to catch it. Do not re-introduce them.
  - [ ] **The `finally` is load-bearing.** Any path that leaves a space id in the
        in-flight set — an early `return`, a throw that skips the delete — wedges that
        space's autosave *permanently* (every later flush re-arms and returns forever).
        This is the one way this fix could be worse than the bug; check it explicitly in
        review.
  - [ ] Cost accepted: an edit arriving mid-flush waits one extra debounce window
        (≤ ~400 ms + the in-flight flush's tail) instead of racing. Nothing is lost — the
        `ChangeSet` keeps accumulating; only the send is deferred.

---

## 4. 📦 New Dependencies

**One new dev dependency, added at the tech-planning gate: `vitest`** (npm, `-D`,
frontend only). No new NuGet package, no runtime dependency, no config change beyond
wiring the runner + a `test` script.

**Why this plan originally said "none", and why that changed.** T-24's design was chosen
*because* it is pure and trivially unit-testable — that was an explicit tie-breaker
against the reducer design, and the reason the minimal `flush()`/`resolve()` protocol was
rejected ("no type error, and no tests to catch the misuse"). But a check at
implementation time found the repo has **no frontend test runner at all** — no vitest, no
jest, no `test` script, zero `.spec.ts`/`.test.ts` files. So the testability the design
was picked for was unreachable, and `pendingChanges.ts` would have shipped pure but
untested.

That is unacceptable for **this specific module** because it is the one piece of B-15
that **T-34's manual drive cannot realistically verify**: proving `add`+`delete`
annihilates, or that `update`+`update` keeps the *earliest* snapshot, requires hitting
an exact interleaving inside a 400 ms debounce window by hand. They are pure functions —
each is a ~3-line test.

**Scope is deliberately narrow (do not widen it in this task):** `vitest` covers
`pendingChanges.ts`'s coalescing rules + zone cascade (**SC-7**) and nothing else. **No**
component tests, **no** store tests, **no** Vue Test Utils, **no** CI wiring. Broader
frontend coverage is a separate concern and is not B-15's job.

The Kiota regen (T-21) needs two **global dotnet tools** that are not part of a fresh
clone — `Swashbuckle.AspNetCore.Cli` (**version-matched to the API's Swashbuckle,
10.2.3**) and `Microsoft.OpenApi.Kiota`, on PATH via `~/.dotnet/tools`. These are
developer tooling, not project dependencies: no `.csproj` or `package.json` change.

---

## 5. ✅ Resolved Questions (all closed at the tech-planning gate, 2026-07-15)

**Nothing here is open. Do not reopen any of it** — these are user decisions taken at the
gate. Kept as a record of what was asked and why it went the way it did.

1. **FR-5 tightens photo *replacement* on Free vs today's behaviour → ✅ CONFIRMED, gate
   it.** Today's count-delta rule (`after.Photos > before.Photos`) **allows** a downgraded
   Free user to swap an existing photo for a different one — the count is unchanged. This
   task ends that: `CheckItemPhotoChange` rejects `Replaced` (`reason: photos`).
   **Accepted as a deliberate tightening, not a faithfulness bug** — "downgrade keeps data
   but makes over-cap content read-only", and writing new photo content is not keeping
   data. The count-delta shape was an artifact of only ever having whole-graph counts; the
   per-item path can finally see the transition. Still allowed on Free: removing a photo,
   editing a photo-bearing item, and resending an *identical* photo (`PhotoChange.None`).
   See **D-2**. A reviewer who spots the behaviour change should read this, not "fix" it.
2. **`PATCH /api/spaces/{id}` vs `PUT /api/spaces/{id}/fields` (FR-7) → ✅ RESOLVED:
   `PUT /api/spaces/{id}/fields`.** This plan recommended PATCH and was **overruled** at
   the gate. The body is a full replace of the scalar set, which is PUT-shaped; the
   scalars get their own explicit sub-resource. See **D-6** (which keeps the original
   PATCH reasoning on the record). Affects T-18, T-22, T-23, T-25 — the composable method
   is `updateFields`, never `patchFields`.
3. **The zone-existence check on item add/update is new server behaviour → ✅ CONFIRMED,
   keep it.** `Item.ZoneId` is deliberately a loose, unvalidated reference today (no FK,
   `ItemDtoValidator` comments it "intentionally loose"), and B-13 explicitly declined to
   enforce it; this task enforces it anyway. It is what forces the two-phase flush (D-7,
   SC-6). Accepted reasoning: a granular endpoint that accepts an item pointing at a
   nonexistent zone is a silent data-corruption vector that the whole-graph path only
   avoided by accident.
4. **`design-an-interface` on the pending-change/flush module → ✅ RAN.** Four designs
   explored. Result folded into **T-24** (the "common-case" shape + the reducer design's
   purity discipline; three alternatives rejected on the record there). **It also found
   two real bugs in this plan**, both now fixed: **BUG 1** — the phase-1-failure drop rule
   covered only item-*adds*, missing FR-5 reassigning *updates* (**D-7**, **SC-6**,
   **T-25**); **BUG 2** — overlapping flush windows letting a stale rollback stomp a newer
   edit, unaddressed entirely (**SC-9**, **T-25**; fixed by serializing flushes per space,
   chosen at the gate over per-entity generation stamps).

---

## Traceability

| FR | Tasks |
|---|---|
| FR-1 add zone | T-4, T-5, T-13a, T-16, T-19, T-23, T-25, T-34.4 |
| FR-2 update zone | T-5, T-13b, T-15, T-19, T-23, T-25, T-34.5 |
| FR-3 remove zone (cascade) | T-5, T-13c, T-16, T-19, T-24, T-25, T-34.3 |
| FR-4 add item | T-2, T-4, T-13d, T-16, T-20, T-23, T-25, T-34.4 |
| FR-5 update item | T-2, T-4, T-13e, T-15, T-20, T-23, T-25, T-34.5 |
| FR-6 remove item | T-5, T-13f, T-16, T-20, T-23, T-25 |
| FR-7 space scalars | T-5, T-10, T-11, T-12, T-15, T-18, T-23, T-25, T-34.2 |
| FR-8 per-mutation cap | **T-4**, **T-6**, T-8, T-13a/d/e, T-32, T-34.5 |
| FR-9 concurrency | **T-16**, T-3, T-13a/d, T-34.9 |
| FR-10 ownership | **T-5**, T-15, T-16, T-13 (rule 2), T-34.8 |
| FR-11 partial failure | **T-24**, **T-25**, T-34.7 |
| FR-12 photo validation | T-9, T-13d/e (rules 3–4), T-7, T-34.6 |
| FR-13 retire whole-space PUT | T-8, T-14, T-17, T-18, T-34.10 |
