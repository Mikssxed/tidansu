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
</content>
</invoke>
