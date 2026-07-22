# Code Review: B-24 · server-overcap-readonly (server-side over-cap read-only gate across 7 mutate handlers)

**Date**: 2026-07-22
**Reviewer**: branch-code-reviewer agent
**Diff base**: working tree vs origin/main (uncommitted, shares a branch with B-23)
**Files changed (B-24 slice)**: PlanPolicy (rule), PlanPolicyTests, ISpacesRepository + SpacesRepository (rank query), SpaceOverCapGuard (new), Application DI, and 7 handlers (UpdateSpaceFields, AddZone, AddItem, UpdateZone, UpdateItem, RemoveZone, RemoveItem)

> **Scope note.** Trust boundaries, IDOR/existence-oracle ordering, fail-open gates, and secret leakage are owned by the parallel security-reviewer and are **not** covered here. This report is correctness, conventions, scope, dead code, and acceptance-criteria/verification gaps only.

## Summary
Textbook execution of the plan. The over-cap rule lives in exactly one place, decomposed into a pure table-tested Domain rule, an owner-scoped collation-matched SQL rank query, and a single injectable guard that all seven handlers call in the correct invariant position. DeleteSpace is untouched (verified — not in the diff), the two remove handlers correctly gained explicit owner-scoped existence pre-checks before the guard, and Pro short-circuits before the rank query. No correctness bugs found; two minor notes and a set of runtime acceptance criteria that remain unproven because no click-through drive was actually run.

## 🔴 Critical
None.

## 🟠 Major
None.

## 🟡 Minor (nice-to-have)

### [N1] SPA/server over-cap parity relies on an unstated array-ordering invariant
**File**: server `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs:CountSpacesOrderedBeforeAsync` ↔ SPA `src/Tidansu.App/src/composables/useLimits.ts:50-54`
**Category**: Correctness (parity)
**Description**: The server selects the over-cap set by SQL `OrderBy(Id)` **rank** (`WHERE Id < @spaceId`). The SPA (`readonlySpaceIds`) selects it by `spaces.spaces.slice(cap)` — **array index**, not an Id sort. These agree only while the store's `spaces` array stays Id-ordered. That holds after a paginated load (`GetSpaceSummariesPageAsync` orders by Id), so for the actual downgrade-read-only scenario (Free user, no new creates allowed) parity is intact. But `addSpace` (`push`) and `duplicateSpace` (`splice`) insert out of Id order, so a freshly created/duplicated space transiently breaks the array's Id-ordering — irrelevant to the over-cap case today, but it means the plan's claim "the **identical** rule the SPA uses" is imprecise: the SPA uses array order, which equals Id order only by construction.
**Recommendation**: make the parity explicit rather than incidental — either sort by id inside `readonlySpaceIds` (`[...spaces.spaces].sort((a,b)=>a.id<b.id?-1:1).slice(cap)`) or drop a comment in both places pinning the shared "Id-ascending rank" contract, so a future reordering of the store array can't silently desync the badges from the 403s.

### [N2] Double user PK-load on AddZone / AddItem / UpdateItem
**File**: `src/Tidansu.Application/Spaces/SpaceOverCapGuard.cs:34` + the three handlers
**Category**: Correctness / cost
**Description**: These three handlers already `FindByIdAsync(userId)` for their own photo/count gate, and the guard loads the user again. Documented and deliberately accepted in the guard's comment (the optional `Plan`-overload refactor in tech-tasks §Refactoring was declined to keep every call site identical). Noting for completeness only — it is one extra indexed PK read on a write path, negligible.
**Recommendation**: none required; the accepted-cost comment is sufficient.

## 🧭 Convention Violations (project rules)
- None. No frontend/Kiota/migration change (correct — read-query + gate only; `403 {plan:['spaces']}` shape already exists). The verbose distinguishing comments in `PlanPolicy`, the guard, and each handler match the house documentation style and correctly cross-reference the D-1 decomposition so a future reader won't conflate the whole-space gate with the per-space count caps.

## 🏗️ Architecture Notes
- Invariant order is correct in all seven handlers: (1) owner-scoped 404 → (2) over-cap 403 (new) → (3) existing plan/photo/count gates → (4) mutation. Placing the guard **before** `CheckAddZone`/`CheckAddItem`/the photo gate makes `spaces` win the paywall reason on overlap (matches the plan's Open Question 1 default).
- RemoveZone/RemoveItem correctly added explicit `*ExistsInSpaceAsync` owner-scoped pre-checks *before* the guard, keeping not-found precedence and preventing an over-cap oracle on non-owned ids (the repo `false→404` now demoted to a concurrent-delete backstop). (Depth on the oracle property is the security-reviewer's; structurally it reads correct.)
- `SpaceOverCapGuard`'s `AuthenticationException("user not found")` for a missing user is **consistent** with the existing convention (`AddZoneCommandHandler.cs:22-23` throws the same) — not an ad-hoc choice.
- `CountSpacesOrderedBeforeAsync` uses `string.Compare(s.Id, spaceId) < 0` (collation-matched SQL `COUNT(*)`, no `.Include`, no graph load, `WHERE UserId == userId`). Correct per the collation-parity requirement.

## 👍 Positives
- The Domain rule `CheckSpaceContentMutation` is pure, mirrors `CheckAddZone`'s shape, and is table-tested (5 rows incl. Pro-unlimited and the at-cap boundary rank=2). Right test surface.
- One shared definition, three seams, seven identical call sites — exactly the DRY consolidation the plan intended; no second over-cap definition invented.
- DeleteSpace explicitly untouched (verified absent from the diff) — the recovery path stays open, satisfying "whole-space delete stays allowed."

## Acceptance criteria unproven by the no-browser gap (requested)
The tech-tasks verification checkboxes are marked `[x]` (incl. the manual API drive and frontend smoke), but per the review brief **no literal click-through / direct-API drive was actually run**, so treat these as unproven:
- End-to-end `403 {"errors":{"plan":["spaces"]}}` body through `ErrorHandlingMiddleware` for all six content-mutate ops against an over-cap space, with **no data change** on re-read.
- Recovery path: `DELETE` an over-cap space → the next-ranked space becomes editable on the very next request (live, uncached rank).
- SPA/server agree on the **same** over-cap set (the [N1] parity smoke) — the one place a silent product break could hide.
Statically proven from code: DeleteSpace ungated, Pro short-circuit, the Domain rule, not-found-before-over-cap ordering, per-space count caps unchanged.

## Action Checklist
- [ ] [N1] Make the SPA/server over-cap ordering contract explicit (sort `readonlySpaceIds` by id, or comment the shared Id-rank invariant in both files).
- [ ] [N2] No action required (accepted double-load).
- [ ] Run the (claimed-but-unrun) over-cap direct-API drive + the SPA/server parity smoke before closing.
