# Code Review: B-26 space-read-dto-overcap (uncommitted on main)
**Date**: 2026-07-23
**Reviewer**: branch-code-reviewer agent
**Diff base**: HEAD (working tree; all B-26 work uncommitted)
**Files changed**: 19 modified + 3 new (2 code, 1 task folder)

## Summary
Clean, disciplined implementation of the read-DTO split. The `SpaceOverCapGuard`
refactor is behaviorally identical to the pre-refactor path, all four security
lens items (S-1..S-3 ordering/forgery/divergence, fail direction) check out
structurally, and the Kiota client is a genuine regen. All gates verified green
by the reviewer (dotnet build 0 errors, dotnet test 67/67, vitest 49/49,
vue-tsc build clean). One Minor finding: the single load-bearing SPA mapping
line is mutation-untested because the new suite mocks above the mapper seam.

## 🔴 Critical (must fix before merge)
*None.*

## 🟠 Major (strongly recommended)
*None.*

## 🟡 Minor (nice-to-have)
### [N1] `toSpace`'s `overCap` mapping line is invisible to every gate except the manual drive
**File**: `src/Tidansu.App/src/api/spaceMapping.ts:46` (the `overCap: dto.isOverCap ?? false` line)
**Category**: Functional (test coverage)
**Description**: `Space.overCap` is optional (`src/Tidansu.App/src/data/types.ts:84`),
so deleting this line compiles clean under vue-tsc. The new
`useSpacesStore.deepLink.test.ts` mocks `useSpacesApi` wholesale and hands the
store pre-built `Space` objects, so the real DTO→Space mapper is never executed
by any test. Net effect: the one line that actually connects the B-26 backend
flag to the SPA can be silently removed (or the field renamed on a future Kiota
regen) with every automated gate staying green — only the manual deep-link drive
would notice. Test 2's identity/merge assertion is real and load-bearing
(removing `existing.overCap = full.overCap` in the store reddens it); test 1
mostly pins pre-existing push behavior.
**Recommendation**: Add a tiny `spaceMapping.test.ts` case: feed `toSpace` a
minimal `SpaceReadDto` with `isOverCap: true` and assert `overCap === true`
(plus `isOverCap: undefined` → `false` to pin the fail-open-on-badge default).
No store, no mocks — pure function test.

## 🧭 Convention Violations (project rules)
*None found.* Kiota client regenerated, not hand-edited (lock `descriptionHash`
updated; non-Space diff lines in `models/index.ts` are pure reordering).
Template purity untouched (no `.vue` changes). No hardcoded hex. Layer
discipline intact (guard stays in Application; no EF anywhere new).

## 🏗️ Architecture Notes
- **Guard-refactor equivalence — verified line-by-line.** The extracted private
  `OverCapReasonAsync` preserves the exact former body of
  `EnsureSpaceContentWritableAsync`: same `FindByIdAsync` → `AuthenticationException`
  first, Pro short-circuit (`PlanCaps.For(user.Plan).Spaces is not int`) *inside*
  the shared path (Pro never runs a rank query, on reads either), then the single
  `CountSpacesOrderedBeforeAsync` call feeding `CheckSpaceContentMutation`.
  `Ensure...` still throws `PlanLimitException(reason)` on the same condition;
  no query shape/order change.
- **S-1 existence oracle — clear.** `GetSpaceQueryHandler.cs:19-25`: the
  owner-scoped `GetLayoutByIdAsync` (`Where(s.Id == id && s.UserId == userId)`,
  `SpacesRepository.cs:82-84`) → `NotFoundException` strictly precedes the guard
  call. `IsSpaceOverCapAsync` has exactly one call site (the read handler,
  post-404). The `AuthenticationException` inside the guard is unreachable on
  the read path (a deleted user owns no spaces → 404 first). Guard class doc
  names the read caller and restates the owner-scope-first rule.
- **S-2 forgery — structurally impossible.** No endpoint binds `SpaceReadDto`
  (`[FromBody] SpaceDto` unchanged, `SpacesController.cs:58`); the generated
  client still serializes `SpaceDto` for POST
  (`apiClient/api/spaces/index.ts:89` `requestBodySerializer: serializeSpaceDto`);
  `SpaceDto.ToEntity` maps no over-cap field, so a sent `isOverCap` is dropped
  by STJ binding. `FromEntity` deleted from `SpaceDto` with the B-16 warning
  comment in place.
- **S-3 predicate divergence — clear.** Grep confirms
  `CountSpacesOrderedBeforeAsync` has exactly one Application call site (the
  guard, `SpaceOverCapGuard.cs:64`) and `CheckSpaceContentMutation` exactly two
  (guard + `GetSpacesQueryHandler.cs:40`, unchanged). No new comparison code
  (C-2 collation trap avoided by construction).
- **Create-response `false` is genuinely deterministic**, not a placeholder:
  success ⇒ post-insert `count <= cap` on every plan path, so max rank
  `count-1 < cap` ⇒ `CheckSpaceContentMutation` returns null for every space
  including the new one. The in-code justification at
  `CreateSpaceCommandHandler.cs:80-85` is correct.
- **Fail direction (SPA)**: a missing/stale flag maps to `overCap: false` —
  fail-open on the *badge* only; the server still 403s every mutation and the
  pre-existing `planReasonOf` → paywall path catches it. This matches the
  accepted point-in-time-staleness decision and never fails open on enforcement.
- **No EF migration needed — confirmed** (projection-only; `IsOverCap` computed,
  never stored). `GetSpacesQueryHandler` diff empty (C-4).

## 👍 Positives
- The guard deepening is a textbook deep-module move: four consumers, one
  private reason path, the collation trap and Pro short-circuit stay hidden.
- Doc comments carry the *why* at every hazard point (S-1 ordering comment in
  the handler, merge-only contract at the store assignment, determinism note on
  the create response) — future editors are warned exactly where it matters.
- `patterns.md` exemplar line added as planned; stale `useLimits` doc rewritten
  rather than left to rot.
- Store test 2's same-object-reference assertion correctly guards the
  merge-only contract (the M2 pending-ChangeSet hazard).

## Action Checklist
- [x] [N1] Add a pure `spaceMapping.test.ts` asserting `toSpace` maps
      `isOverCap` → `overCap` (true and undefined→false cases).
      _Fixed inline at the Stage-4 gate: `src/Tidansu.App/src/api/spaceMapping.test.ts`
      pins `toSpace` (true/false/undefined→false) and `toSpaceSummary`
      (true/undefined→false). Vitest 54/54, `npm run build` green._
