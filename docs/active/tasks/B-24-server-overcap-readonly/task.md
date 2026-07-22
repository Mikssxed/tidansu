---
id: B-24
slug: server-overcap-readonly
title: Server-side enforcement of read-only over-cap content after downgrade
status: in-review   # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: []
touch-points:
  - src/Tidansu.Application (space update, zone/item create/update handlers)
  - their validators / authorization
  - src/Tidansu.Domain plan constants
---

# B-24 · Server-side enforcement of read-only over-cap content after downgrade

## Description
B-17 makes over-cap spaces read-only **in the SPA only** — it disables the
mutating affordances and badges the spaces, but the API still accepts the
mutations. A downgraded (Free) user holding a valid JWT can therefore still
rename, add zones/items to, or otherwise mutate a space beyond `caps.spaces` by
calling the endpoints directly, bypassing the UI. This task is the server-side
half of the product rule "downgrade keeps data but makes over-cap content
read-only". Until it lands, B-17 is UX honesty only, not real access control.

## Acceptance criteria
- [x] For a Free-plan user, the mutate handlers (space update, zone/item
      create/update) reject writes to over-cap spaces with a plan-limit error the
      SPA already knows how to surface (`reason: 'spaces'`).
- [x] Over-cap selection is the **same deterministic rule the SPA uses**: spaces
      beyond `caps.spaces` by stable `OrderBy(s => s.Id)` order, evaluated live
      (not snapshotted) on every request.
- [x] Zone/item **removal** inside an over-cap space is also rejected, matching
      what B-17's SPA already disables (assumption pending PO confirmation — see
      Open Question 1 in requirements.md).
- [x] **Whole-space delete stays allowed** on over-cap spaces (it's the recovery
      path back under the cap) — never gated by this item.
- [x] Pro-plan users are unaffected; under-cap spaces for Free users are unaffected.
- [x] The separate, already-correct per-space zone/item count gates (add-only,
      not update/delete) are unchanged by this item.

## Notes
- Reuse the plan-cap/ownership check already used for adds and the Domain plan
  constants; do not invent a second over-cap definition — it must match the SPA's.
- Full pipeline (plan-gating / authorization logic on a sensitive surface).
- Renumbered from a colliding `[B-23]` in the backlog (2026-07-22). Independent of
  B-23 for requirements/tech-planning; both may touch space update / `SpaceDto`,
  so serialize implementation if the diffs overlap.
- This item's gate is orthogonal to `PlanPolicy`'s per-space zone/item count
  caps: those are deliberately un-gated on update/delete (see the codebase
  comment in `PlanPolicy.cs`) — this item's gate answers a different question
  ("is this whole space one of the account's excess spaces?"), not "does this
  space have too many zones/items?". Do not conflate or merge the two checks.
- Open questions for tech-planning: whether zone/item removal is in scope
  (assumed yes, see requirements.md Q1); no special logging of bypass attempts
  planned (Q2); no grace period after downgrade — rule is immediately live (Q3).

### Tech-planning notes (2026-07-22)
- Tech tasks written → [`./tech-tasks.md`](./tech-tasks.md).
- **Seam decided:** the over-cap rule lives in ONE shared place, split three ways —
  pure Domain rule `PlanPolicy.CheckSpaceContentMutation(plan, precedingSpaceCount)`
  (mirrors `CheckAddZone`, table-tested), owner-scoped SQL rank query
  `ISpacesRepository.CountSpacesOrderedBeforeAsync` (collation-matched to
  `GetSpaceSummariesPageAsync`'s `OrderBy(Id)`), and a new injectable Application
  guard `SpaceOverCapGuard.EnsureSpaceContentWritableAsync` that all six mutate
  handlers call. Over-cap = `precedingSpaceCount >= caps.spaces`.
- **Handlers gated:** UpdateSpaceFields, AddZone, AddItem, UpdateZone, UpdateItem,
  RemoveZone, RemoveItem. DeleteSpace explicitly left untouched (recovery path).
- **Resolved decisions from human gate applied:** zone/item removal is in scope
  and rejected; no bypass-attempt logging; no grace period.
- **No EF migration, no Kiota regen, no frontend code** — read-query + gate only;
  the `403 {plan:['spaces']}` shape already exists and the SPA already renders it.
- **Two open questions carried into implementation:** (1) confirm `spaces` should
  win the paywall when an over-cap space also trips a zone/item/photo cap (this
  plan reports `spaces` first); (2) confirm the SPA gracefully surfaces a surprise
  over-cap 403 from an update/remove endpoint in the cross-tab downgrade race
  (FR-6 says no new SPA handling needed). See tech-tasks.md §5.
- **Watch-out for implementer:** the rank query MUST be computed in SQL with the
  same collation as `OrderBy(Id)` (use `string.Compare(s.Id, spaceId) < 0`); an
  in-memory ordinal compare can pick a different over-cap set than the SPA badges.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
