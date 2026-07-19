---
name: lazy-list-pagination-regression-checks
description: Two regressions to hunt whenever a slice makes the spaces (or any) list lazy/paginated — deep-link reachability and client-side aggregates over the now-empty arrays
metadata:
  type: feedback
---

When a slice slims a list read to summaries + per-detail lazy-load and/or paginates it (B-16
pattern), two regressions ride along that the diff's own touch-points usually miss:

1. **Deep-link / refresh reachability.** Once `hydrate()` loads only page 1, any view that does
   `store.getById(routeId)` and redirects-on-null (SpaceView's `watch(space, …, {immediate})` →
   `router.replace`) will bounce a direct nav / bookmark / F5 to a detail whose summary isn't on
   the loaded page. Fix shape: fall back to `api.get(id)` and insert into the store before
   deciding the id is unknown; only redirect on a real 404.

2. **Client-side aggregates over the now-empty `items`/`zones` arrays.** Any component still doing
   `store.spaces.reduce(…, s.items.length)` (AccountView usage meters) silently undercounts once
   those arrays are `[]` until opened. FR-2 wants plan-limit counts accurate. The summary already
   carries `itemCount`/`zoneCount` — swapping `s.items.length` → `s.itemCount` is the cheap
   correct-enough fix; the backend `AccountDto.usage` aggregate is the multi-page-correct version.

**Why:** both are natural, invisible consequences of the read-shape change on views *outside* the
dispatched touch-point list, so they don't show up in the diff and pass build/vitest.
**How to apply:** on any lazy-list/pagination review, grep for `.items.length`/`.zones.length` in
components and for `getById(...)`+redirect patterns in routed detail views before signing off.
Related: [[verify-claims-vs-test-count]], [[empty-fixtures-hide-rollback-bugs]].
