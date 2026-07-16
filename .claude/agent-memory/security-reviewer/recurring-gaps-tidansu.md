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

- **Client-supplied primary keys that are globally unique.** `Space`/`Zone`/`Item` all take
  their `Id` from the client DTO, and all three are `PrimaryKey(x => x.Id)` — *not* scoped
  by `SpaceId`/`UserId`. Combined with the frontend's `uid()` in `src/data/spaces.ts`
  (a module-level counter that resets each page load + the low 3 base36 digits of
  `Date.now()` ≈ 46,656 values, cycling ~47s — a clock, not a CSPRNG), one account can
  squat the id space and turn every other user's insert into a PK violation → 500. Filed as
  S-H1 in `docs/active/tasks/B-15-granular-space-endpoints/security-review.md` (2026-07-16).
  **If this is still open, any new client-keyed entity inherits it.**
- **Unbounded collection/scalar fields slip past validators.** `ColumnLabels`
  (`List<string>?` → EF primitive collection → unbounded column) and `LayoutColumns` (`int`,
  no range) have never had validator rules, in either `SpaceDtoValidator` or the newer
  `SpaceFieldsDtoValidator`. The validators bound the *strings someone remembered to bound*.
  Check every collection and every numeric on a new DTO.
- **`[RequestSizeLimit]` gets dropped when an endpoint is split or replaced.** B-15's
  `PUT /api/spaces/{id}/fields` replaced a `PUT` that had a 24 MB limit and shipped with
  none (→ Kestrel's ~28.6 MB default, i.e. a *larger* ceiling than what it replaced). When a
  route is retired in favour of new ones, diff the attributes, not just the handler.
- **Generic-catch 500s are an information oracle.** `ErrorHandlingMiddleware`'s catch-all
  returns a flat "Something went wrong." with no detail (good), but the *status* still
  distinguishes "DB constraint hit" from "success". Where a constraint encodes cross-tenant
  state, 200-vs-500 leaks it.

See [[confirmed-protections-spaces]] for what's already verified and shouldn't be re-flagged.
