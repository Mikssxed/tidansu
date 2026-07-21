---
name: recurring-gaps-tidansu
description: Recurring security gap classes in Tidansu — client-supplied global PKs, unbounded collection fields, size limits lost when endpoints are split
metadata:
  type: project
---

Gap classes that have recurred in this repo. Check these first — the obvious stuff
(userId scoping, plan gates) is already handled well and rarely breaks.

**Why:** Tidansu's authz and plan-gating are unusually well-defended and heavily
commented, so audits that only walk the checklist come back empty. The real findings
have been in what the checklist doesn't name.

**How to apply:** on any diff touching entities, DTOs, validators, or endpoint shape.

- **Client-supplied primary keys that are globally unique.** All three of
  `Space`/`Zone`/`Item` take their `Id` from the client DTO. The frontend's `uid()` in
  `src/data/spaces.ts` is a module-level counter that resets each page load + the low 3
  base36 digits of `Date.now()` ≈ 46,656 values, cycling ~47s — a clock, not a CSPRNG — so
  one account can squat the id space and turn every other user's insert into a PK violation
  → 500 (cross-tenant DoS) plus a 200-vs-500 existence oracle. Filed S-H1 in
  `docs/active/tasks/B-15-granular-space-endpoints/security-review.md` (2026-07-16).
  **Status as of 2026-07-21 (B-22): fixed for `Zone`/`Item` only** — both are now
  `HasKey(SpaceId, Id)`. **`Space.Id` is still a single-column client-supplied PK** (no
  `HasKey` on `Entity<Space>` → EF convention), with no existence pre-check in
  `CreateSpaceCommandHandler` and no rate limiter on `POST /api/spaces`; Pro has unlimited
  spaces, so the squat is cheap. Re-filed as S-H1 in B-22's `security-review.md`.
  Don't be fooled by B-22's comments in `ErrorHandlingMiddleware` / `SpacesRepository`:
  they read repo-wide but are scoped to Zone/Item, and the `DbUpdateException`→500 clause
  hides the *message*, not the 200-vs-500 *signal*. Any new client-keyed entity inherits this.
- **Unbounded collection/scalar fields slip past validators.** `ColumnLabels`
  (`List<string>?` → EF primitive collection → unbounded column) and `LayoutColumns` (`int`,
  no range) have never had validator rules, in either `SpaceDtoValidator` or the newer
  `SpaceFieldsDtoValidator`. The validators bound the *strings someone remembered to bound*.
  Check every collection and every numeric on a new DTO.
- **`[RequestSizeLimit]` gets dropped when an endpoint is split or replaced.** B-15's
  `PUT /api/spaces/{id}/fields` replaced a `PUT` that had a 24 MB limit and shipped with
  none (→ Kestrel's ~28.6 MB default, i.e. a *larger* ceiling than what it replaced). When a
  route is retired in favour of new ones, diff the attributes, not just the handler.
- **Paging validators clamp `PageSize` but leave `Page` unbounded.** `GetSpacesQueryValidator`
  caps `PageSize` to 1..100 (the DoS guard everyone credits) but bounds `Page` only with
  `>= 1`. `skip = (Page - 1) * PageSize` is unchecked `int` arithmetic, so a large `Page`
  overflows to a negative `OFFSET` → SQL error → 500. Filed S-M1 in B-16's `review.md`
  (2026-07-19). On any new paged endpoint: bound BOTH page params and treat `skip` as `long`.
- **Generic-catch 500s are an information oracle.** `ErrorHandlingMiddleware`'s catch-all
  returns a flat "Something went wrong." with no detail (good), but the *status* still
  distinguishes "DB constraint hit" from "success". Where a constraint encodes cross-tenant
  state, 200-vs-500 leaks it.

See [[confirmed-protections-spaces]] for what's already verified and shouldn't be re-flagged.
