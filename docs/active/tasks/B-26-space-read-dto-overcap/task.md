---
id: B-26
slug: space-read-dto-overcap
title: Carry the over-cap flag on GET /api/spaces/{id} via a read-DTO split
status: done       # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: [B-25]     # done — B-25 added IsOverCap to the list; this extends it to the single-space read
touch-points:
  - src/Tidansu.Application/Spaces/Dtos/SpaceDto.cs          # split: shared request/response DTO → separate read DTO
  - src/Tidansu.Application/Spaces/Queries/GetSpace/          # single-space query handler maps the flag
  - src/Tidansu.App/src/api/spaceMapping.ts                  # toSpace deliberately doesn't map the flag today — revisit
  - src/Tidansu.App/src/api/apiClient/                       # Kiota regen (contract change)
---

# B-26 · Carry the over-cap flag on `GET /api/spaces/{id}` via a read-DTO split

## Description
B-25 made the spaces **list** carry the server's authoritative `IsOverCap` per
space, so the SPA badges exactly what the server 403s. The **single-space**
endpoint (`GET /api/spaces/{id}`) still doesn't — so a deep link into a space that
was never loaded via the list has no badge truth until the list is fetched. The
blocker is that `SpaceDto` doubles as the create/update **request body** (the B-16
shared-DTO wipe trap), so a server-computed field can't be added to it safely; the
endpoint needs its own read/response DTO first, then the flag computed via the same
`PlanPolicy.CheckSpaceContentMutation` predicate that `SpaceOverCapGuard` and the
list handler share.

## Acceptance criteria
- [ ] `GET /api/spaces/{id}` returns the space's over-cap status, computed by the
      exact same predicate + `OrderBy(Id)` rank the guard enforces with (never a
      second, divergent code path).
- [ ] Create/update request bodies are unaffected — no server-computed field is
      accepted (or silently wiped) on write; the B-16 shared-DTO wipe trap stays closed.
- [ ] A deep link into an over-cap space shows the read-only badge without the
      list having been fetched; a kept space deep-links fully editable.
- [ ] No regression to the list badge flow (B-25), plan paywalls, or space CRUD.

## Notes
- Origin: B-25 deferred question Q1 — see `../B-25-overcap-badge-parity/tech-tasks.md`
  and backlog entry [B-26]. Backlog suggests `design-an-interface` for the DTO split.
- SPA side: `toSpace` in `spaceMapping.ts` deliberately doesn't map `overCap` today
  (B-25 T-6); the deep-link consumption path must revisit that without breaking the
  merge-only flag-refresh contract in `useSpacesStore`.
- Low urgency context: server enforcement already 403s correctly on every mutation —
  only the badge can lag on the deep-link path. P3.
- Tech-planning decisions (see `./tech-tasks.md` for full rationale):
  - **Split shape:** new flat `SpaceReadDto` is the sole *response* shape for the
    space root (`GET /{id}` AND `POST` create); `SpaceDto` keeps its name, becomes
    request-only (`FromEntity` deleted). Inheritance and wrapper shapes rejected
    (FR-2 separation / Kiota churn). `design-an-interface` fan-out not needed —
    the blast radii were not close.
  - **Key discovery:** `SpaceDto`'s write surface is *create-only* (no whole-graph
    PUT exists — `SpaceFieldsDto` + granular zone/item endpoints replaced it), so
    the B-16 "split alone doesn't fix full-replace round-trips" caveat does NOT
    apply — the split is safe here.
  - **Rank for a single read:** reuse `SpaceOverCapGuard` — deepened with
    `IsSpaceOverCapAsync` sharing one private path with
    `EnsureSpaceContentWritableAsync` (Pro short-circuit +
    `CountSpacesOrderedBeforeAsync` + `CheckSpaceContentMutation`). ⚠️ the 404
    must stay before the guard call in `GetSpaceQueryHandler` (existence oracle).
  - **Create response flag is deterministically `false`** (successful create ⇒
    `count <= cap` on every plan path) — no rank query on create.
  - **No EF migration** — confirmed (DTO/handler/controller-only).
  - SPA: `toSpace` maps `overCap`; `loadSpaceContents` merges the flag onto the
    existing object (merge-only contract) in the known-id branch; the cold-cache
    push needs no code change. No view changes — `isSpaceReadOnly` picks it up.
  - Approved product decisions carried in: point-in-time staleness on single-space
    reads accepted; live mid-session flip deferred to sync (B-25 Q2).

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
