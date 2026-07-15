---
id: B-14
slug: usage-counts-projection
title: Account usage counts via projection, not full space-graph load (SC-1)
status: done        # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: []
touch-points:
  - src/Tidansu.Application/Account/Queries/GetAccount/GetAccountQueryHandler.cs
  - src/Tidansu.Application/Account/Commands/ChangePlan/ChangePlanCommandHandler.cs
  - src/Tidansu.Application/Account/Commands/SetSync/SetSyncCommandHandler.cs
  - src/Tidansu.Application/Account/Dtos/UsageDto.cs
  - src/Tidansu.Domain/Repositories/ISpacesRepository.cs
  - src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs
---

# B-14 · Account usage counts via projection, not full space-graph load (SC-1)

## Description
The account page shows three usage numbers: how many spaces the user has, how
many items they have in total, and how many items sit in their fullest space.
Today the app fetches the user's entire account contents — every space, every
zone, every item, including each item's embedded photo — just to count those
three numbers. For a Pro user with a few hundred photo items that means pulling
multiple megabytes out of the database and into memory every time the account
page loads, to produce three integers. The numbers shown must not change; only
the cost of producing them.

## Acceptance criteria
- [x] The account page shows the same three usage numbers as before (spaces,
      total items, fullest space) for every account shape: no spaces, spaces with
      no items, several spaces with differing item counts.
- [x] A user with zero spaces still sees `0 / 0 / 0` rather than an error.
- [x] Computing usage no longer loads zones, items, or photo blobs into memory —
      the counts come from an aggregate/projection query.
- [x] The plan-change flow and the sync toggle still return correct usage in
      their responses (both currently compute usage the same wasteful way).
- [x] No change to the account API response shape (no Kiota regen needed).
- [x] No regression to plan caps/paywall behaviour, which read these counts.

## Notes
- Source: B-8 audit finding 🟠 SC-1.
- **Scope beyond the backlog text — confirmed at requirements gate:** the
  backlog names only `GetAccountQueryHandler`, but `grep` shows the identical
  `GetAllByUserAsync` → `UsageDto.From` pattern in **three** places:
  `GetAccountQueryHandler.cs:21`, `ChangePlanCommandHandler.cs:35`, and
  `SetSyncCommandHandler.cs:37`. All three are in scope for this task — the
  fix must land in all three, not just the named handler, or the audit
  finding is only a third fixed. See `requirements.md` FR-3.
- `UsageDto.From(List<Space>)` is the shared seam — it only ever reads
  `spaces.Count` and `s.Items.Count`, so nothing needs the graph.
- `GetSpacesQueryHandler.cs:15` also calls `GetAllByUserAsync`, but that one
  legitimately needs the full graph — leave it alone. Slimming *that* payload is
  B-16, a separate task.
- Related: B-16 (stop shipping photo data-URLs inline) tackles the same photo
  blobs from the read-path side.

### Tech-planning decisions (2026-07-15 → `tech-tasks.md`)
- **Projection shape**: `Spaces.Where(userId).Select(s => s.Items.Count).ToListAsync()`
  — one round-trip, one int per space, no zones/items/photo columns leave SQL.
  Count/Sum/Max run in memory over the materialized `List<int>`, which is *why*
  the zero-spaces case is safe: an empty list, never a SQL `NULL`. Rejected
  `MaxAsync` (3 round-trips + the empty→NULL throw) and `GroupBy` (needs its own
  zero-groups guard, pushes derivation into Infrastructure).
- **Seam**: `UsageDto.From(List<Space>)` → `From(List<int> itemCountsPerSpace)`.
  Only three callers exist, so the signature change is free — and the compiler
  failing on a missed call site is the proof all three were swapped.
  `AccountDto.From(user, usage)` is unchanged, which is what keeps the API shape
  identical (no Kiota regen, no migration).
- **Keep the `Count == 0 ? 0 : Max()` guard verbatim** — without it every
  zero-space user (i.e. every new signup's first account-page load) 500s.
- **Don't fold in neighbours**: `.AsNoTracking()` on `GetAllByUserAsync` is B-8
  SC-2; photo payload slimming is B-16; `GetSpacesQueryHandler` stays untouched.
- **Verification is manual** — `tests/Tidansu.Domain.Tests` references Domain
  only and this rule lives in Application, so there's no unit-test home for it
  without adding structure. Drive the edge-case matrix in the running app and
  **read the EF SQL log** to prove the graph is gone (dev-only: base
  `appsettings.json` keeps EF at `Warning`; Development sets `Information`).
  Correct numbers alone are not evidence the fix landed.
- No 🔴/🟠 security items. Two open questions, both non-blocking (see
  `tech-tasks.md` §5).

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
