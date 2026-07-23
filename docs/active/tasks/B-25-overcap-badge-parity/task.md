---
id: B-25
slug: overcap-badge-parity
title: Make SPA over-cap badging agree with the server's read-only set
status: done   # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: [B-23, B-24]   # both done — this is the parity follow-up carved out of their reviews
touch-points:
  - src/Tidansu.Application/Spaces/Dtos/SpaceSummaryDto.cs      # + IsOverCap
  - src/Tidansu.Application/Spaces/Queries/GetSpaces/GetSpacesQueryHandler.cs
  - src/Tidansu.Application/Spaces/SpaceOverCapGuard.cs         # comment-only cross-ref
  - src/Tidansu.App/src/api/apiClient/                          # Kiota regen (contract change)
  - src/Tidansu.App/src/data/types.ts                           # Space.overCap?
  - src/Tidansu.App/src/api/spaceMapping.ts
  - src/Tidansu.App/src/stores/useSpacesStore.ts                # refreshOverCapFlags + triggers
  - src/Tidansu.App/src/composables/useLimits.ts
---

# B-25 · Make SPA over-cap badging agree with the server's read-only set

## Description
After a downgrade, the server (B-24) freezes exactly `total - caps.spaces` spaces,
chosen by `OrderBy(s => s.Id)`, on every request. The SPA, however, badges over-cap
spaces by **array position** (`spaces.slice(caps.spaces)` in `useLimits.ts`), and since
B-23 made `Space.Id` server-assigned and random, the store's array order no longer
tracks the server's `Id` order (`reconcileSpaceId` doesn't re-sort). So the SPA can
grey out a *different* set of spaces than the server actually makes read-only — a user
may try to edit a space that 403s, or avoid one that's actually editable. This is a
UI-parity bug, **not** a security bypass: server enforcement is correct regardless.

## Acceptance criteria
- [x] The set of spaces the SPA badges as over-cap/read-only is exactly the set whose
      mutations the server rejects (403) — verified by downgrading a multi-space account.
- [x] Kept spaces (the first `caps.spaces` by `Id` order) are fully editable with no
      read-only badge.
- [x] No regression to normal (non-over-cap) badging, plan-cap paywalls, or space
      ordering as displayed to the user.

## Notes
- Fix direction per backlog: badge by the same stable `Id` order the server uses
  (sort by `Id` before slicing), or have the badge follow the server's truth.
- **Stage-2 gate decision (human):** the client-side collation comparator was
  rejected — B-25 ships **server-sent over-cap truth** instead. Reason found in
  planning: the server's order is the DB collation (`SQL_Latin1_General_CP1_CI_AS`,
  CI word-sort), which no client sort can safely replicate; the flag also closes
  the "unknown rank for session-created spaces" hole a client sort cannot.
- **Tech plan (v2, see `tech-tasks.md`):** `SpaceSummaryDto.IsOverCap` computed in
  `GetSpacesQueryHandler` via the SAME `PlanPolicy.CheckSpaceContentMutation`
  predicate `SpaceOverCapGuard` enforces with (rank = `skip + rowIndex` of the
  ordered page query — no N+1, no migration). Kiota regen required. SPA:
  `Space.overCap?` mapped in `toSpaceSummary`; `useLimits.readonlySpaceIds`
  filters on it (keeps the `isInf` early-return → upgrade is instant);
  `useSpacesStore.refreshOverCapFlags()` is a **merge-only** summaries refetch
  (never replaces Space objects — M2 hazard) triggered by a `session.plan` watch
  and by delete success under a finite cap. This is now the **full path**, not
  light — task.md's original "no Kiota regen" note is superseded.
- Open questions for the human (see tech-tasks §5): (1) should
  `GET /api/spaces/{id}` also carry the flag for the deep-link-only edge
  (SpaceDto doubles as a write body — shared-DTO trap); (2) future sync needs a
  sync-driven flag refresh trigger.
- Origin: B-23 security review § S-L1 (`../B-23-scoped-space-keys/security-review.md`)
  and B-24 review (`../B-24-server-overcap-readonly/review.md`).
- **Light path**: no schema change, no new endpoint/Kiota regen, no change to
  enforcement logic — server-side gating stays authoritative.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
