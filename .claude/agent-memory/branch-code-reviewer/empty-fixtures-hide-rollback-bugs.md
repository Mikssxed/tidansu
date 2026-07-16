---
name: empty-fixtures-hide-rollback-bugs
description: A green test whose fixture defaults to empty collections proves nothing about code that copies those collections — check the fixture, not just the assertion count
metadata:
  type: feedback
---

A passing test over a fixture with empty child collections does not pin behaviour that
touches those collections. Read the fixture builder before crediting a test.

**Why:** B-15's `pendingChanges.test.ts` had a green test named "restores the snapshot for a
failed space-scalar update" that could never have caught the real bug — `makeSpace()`
defaults to `zones: []`/`items: []`, so `Object.assign(space, snapshot)` stomping those
arrays was a no-op in the test and silent data loss in production. The test name described
the intent; the fixture removed the teeth.

**How to apply:** generalises [[verify-claims-vs-test-count]] from "what edit would make this
test go red?" to "what does this fixture *not* contain that the code under test reads or
writes?". Applies to any test over an entity with child collections, optional fields, or
nullable branches. When flagging, recommend fixing the fixture default (e.g. `makeSpace()`
should carry a non-empty `items`) rather than adding one bespoke test — the default is what
makes every future test load-bearing. Related review checks:
[[optimistic-rollback-review-checks]].
