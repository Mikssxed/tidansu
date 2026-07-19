---
name: slim-list-lazy-detail-breaks-sync-derivations
description: Splitting a list endpoint into summary+lazy-detail (B-16) silently breaks any client code that assumed the list objects always carried full children — audit every reader, not just the view(s) named in the dispatch.
metadata:
  type: feedback
---

When a slim-list/lazy-detail split lands (B-16: `GET /api/spaces` → paginated
`SpaceSummaryDto`, zones/items load only on open), every place that previously read
`space.zones`/`space.items` off a list-hydrated object either breaks silently or needs
an explicit await-before-use fix — even ones far from the dispatched touch-point list.

Two concrete instances found in B-16:
- `useSpacesStore.duplicateSpace(id)` built a copy from `orig.zones`/`orig.items`
  directly. Once those arrays are empty until opened, duplicating an unopened space
  from the dashboard silently produced an empty copy. Fix: made `duplicateSpace`
  `async` and had it `await loadSpaceContents(id)` first — necessary even though the
  tech-tasks doc didn't call it out, because it's a direct consequence of the lazy-load
  change on a touched seam (`DashboardView.vue`'s `onDuplicate` already called it).
- `AccountView.vue`'s usage stats (`totalItems`, `fullestSpace`) compute client-side via
  `store.spaces.reduce((n, s) => n + s.items.length, 0)`. This view was **not** in the
  dispatch's touch-point list, so it was left as a flagged gap rather than silently
  fixed — it now undercounts until the user has opened every space in the session. The
  proper fix already has a home: `GetAccountQueryHandler` returns `AccountDto.usage:
  UsageDto` (moved off `GetAllByUserAsync` in B-14), but the frontend's
  `useAccountApi().get()` wrapper exists and is never called anywhere. Wiring that in is
  a small, well-scoped fast-follow.

**Why:** a slim-list change is easy to scope to "the dashboard card + the detail view"
because that's where the acceptance criteria live, but any other client-side code that
assumed the list response was the full graph (duplication, aggregate stats, search
across all items, etc.) is an implicit reader of the old contract and breaks the same
way. The tech-tasks doc won't always enumerate these.

**How to apply:** when implementing a summary/detail split, grep the whole frontend for
every place that reads the mutated fields (`.zones`, `.items` in this case) off a
store object that used to be fully hydrated, not just the files named in the dispatch.
Fix what's a direct consequence on an already-touched seam (like `duplicateSpace`);
flag — don't silently expand scope into — anything living in a file that wasn't listed
as a touch point (like `AccountView.vue`).
