---
name: arch-server-overcap-readonly-gate
description: B-24 server enforcement of over-cap read-only — whole-space gate is a DISTINCT authorization boundary from per-space count caps; rank query must be collation-matched to OrderBy(Id)
metadata:
  type: project
---

The server half of "downgrade keeps data but makes over-cap content read-only"
(B-17 was the SPA-only half — see [[frontend_downgrade-readonly-seam]]).

**Fact / decision:** B-24 adds a *whole-space over-cap gate* to every content-mutating
Spaces handler (space update, zone/item add+update+remove). It is deliberately a
DIFFERENT authorization boundary from `PlanPolicy`'s per-space zone/item COUNT caps
(`CheckAddZone`/`CheckAddItem`, which are add-only and un-gated on update/delete per
the D-1 decomposition — see [[arch_plan-gate-decomposition-algebra]]). The count caps
ask "too many zones/items in this space?"; the over-cap gate asks "is this WHOLE space
one of the account's excess spaces beyond `caps.spaces`?" and DOES gate update/delete of
contents. Whole-space DELETE stays ungated (the recovery path back under the cap).

Seam chosen (one definition, three parts): pure `PlanPolicy.CheckSpaceContentMutation(plan, precedingSpaceCount)`
(`precedingSpaceCount >= cap`, mirrors `CheckAddZone`) + owner-scoped SQL rank query
`ISpacesRepository.CountSpacesOrderedBeforeAsync` + injectable Application guard
`SpaceOverCapGuard.EnsureSpaceContentWritableAsync` that all six handlers call after
their 404 check, before mutation.

**Why:** over-cap = position `>= caps.spaces` in the account's `OrderBy(s => s.Id)`
order — the SAME rule the SPA uses to badge (B-17) and the dashboard/space-creation
gate use. Server and SPA MUST select the identical over-cap set or the product looks
broken (a badged-read-only space edits fine, or vice versa).

**How to apply:** if you ever compute or re-derive the over-cap set server-side, the
rank query MUST run in SQL with the same collation as `GetSpaceSummariesPageAsync`'s
`OrderBy(s => s.Id)` — use `string.Compare(s.Id, spaceId) < 0` (EF → `WHERE Id < @s`
under column collation), NEVER an in-memory `string.CompareOrdinal`/C# sort, which can
pick a different set than SQL Server's default collation and silently break SPA/server
parity. Also: run the guard only AFTER an owner-scoped 404 (never a 403 that reveals
over-cap status of a non-owned space); the remove handlers need an explicit
`*ExistsInSpaceAsync` pre-check because their 404 was previously determined inside the
repo delete. Reason precedence: report `spaces` before the zone/item/photo caps.

**B-25 (client half of parity — human gate chose server-sent truth):** the SPA's
positional `spaces.slice(cap)` badge broke once B-23 randomized Space.Id
(reconcileSpaceId doesn't re-sort; duplicateSpace splices mid-array). A client-side
collation-mimicking comparator was planned first and **rejected at the Stage-2 gate**:
the server order is the DB collation (`SQL_Latin1_General_CP1_CI_AS`, CI word-sort —
hyphen quasi-ignorable, `_` < digits < letters), unreplicable safely in JS
(`localeCompare` = ICU ≠ SQL Server; ordinal `<` wrong), and a client sort can never
rank session-created spaces (random server ids, no order info). Shipped design:
`SpaceSummaryDto.IsOverCap` computed in `GetSpacesQueryHandler` from
`PlanPolicy.CheckSpaceContentMutation(plan, skip + rowIndex)` — the SAME predicate
`SpaceOverCapGuard` enforces with; page index = rank (no per-row
CountSpacesOrderedBeforeAsync N+1). SPA: `Space.overCap?`, `useLimits` filters on it
(keep the `isInf` early-return — makes upgrade instant and stale flags invisible on
Pro); freshness = `useSpacesStore.refreshOverCapFlags()`, a **merge-only** summaries
refetch (never replace Space objects — the M2 pending-ChangeSet hazard that bans
`hydrate(true)`), triggered by a `session.plan` watch + delete-success under finite
cap. Open follow-ups: future sync needs its own refresh trigger (B-25 Q2, deferred).

**B-26 (deep-link parity — planned):** the `GET /spaces/{id}` edge closes via a
read-DTO split: new flat `SpaceReadDto` is the sole space-root *response* shape
(GET /{id} AND POST create); `SpaceDto` keeps its name, becomes request-only.
Key discovery: `SpaceDto`'s write surface is create-only (no whole-graph PUT
exists anymore — SpaceFieldsDto + granular zone/item endpoints), so the
[[shared-dto-full-replace-wipe]] caveat doesn't apply and a clean split is safe.
Rank for a single read: `SpaceOverCapGuard` deepened with `IsSpaceOverCapAsync`
(shares one private reason path with Ensure — Pro short-circuit + rank query +
predicate stay ONE implementation; guard is now the oracle for four consumers).
Create's response flag is deterministically false (success ⇒ count <= cap on
every plan path) — no rank query on create. SPA: `toSpace` maps `overCap`;
`loadSpaceContents` merges it field-wise onto the existing object (merge-only
contract), cold-cache push carries it free.
</content>
</invoke>
