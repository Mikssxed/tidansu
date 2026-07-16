---
name: optimistic-rollback-review-checks
description: Two silent-data-loss shapes in the store's optimistic flush/rollback path (snapshot Object.assign stomping child arrays; cascade-delete ordered against reassignment updates) — re-check whenever pendingChanges.ts / useSpacesStore flush changes
metadata:
  type: feedback
---

When reviewing the spaces store's optimistic save path (`src/Tidansu.App/src/data/pendingChanges.ts`,
`useSpacesStore.ts` `flush()`), check these two shapes explicitly. Both were live findings
in B-15 and both are invisible to `dotnet build`, `vue-tsc`, and a backend curl+SQL-log drive.

1. **Whole-entity snapshot + blanket `Object.assign` rollback stomps child collections.**
   `touch()` clones the entity one level deep, so a `Space` snapshot captures `zones: [...]`
   and `items: [...]` as of first touch. `rollbackSpace`'s `Object.assign(space, snapshot)`
   then restores those stale arrays — reverting sibling zone/item adds/deletes that
   *succeeded* in the same window. A rollback must assign only the field set the endpoint
   actually owns (for `PUT /fields`: the six scalars in `toSpaceFieldsBody`).
2. **A server-side cascade delete must be ordered AFTER updates that reassign children out
   of the parent.** The zone-delete cascade keys off each item's *persisted* `zoneId`, so
   firing `DELETE /zones/Z` in the same `Promise.allSettled` as `PUT /items/A {zoneId: Z2}`
   destroys A ~50% of the time. Phase ordering is a correctness constraint, not a
   performance one.

**Why:** both are silent — the server ends up right and the UI wrong, or vice versa, with no
error surfaced; the user only notices after a reload. The task's own AC (FR-11: "a rejected
mutation only rolls back itself") is the thing being violated in case 1.

**How to apply:** when any flush/rollback/coalescing code changes, ask *what else does this
snapshot contain besides the fields the endpoint sends*, and *does any op in this batch
depend on another op in the same batch having already landed*. See also
[[empty-fixtures-hide-rollback-bugs]] — the existing test suite passed on case 1 because its
`makeSpace()` fixture has `zones: []`/`items: []`.
