---
name: review-tidansu-pipeline-context
description: How to review Tidansu pipeline tasks — docs/backlog.md entries are often stale, task.md carries the authoritative corrections, and work may sit uncommitted on main
metadata:
  type: project
---

**`docs/backlog.md` is not the spec.** Backlog entries predate the store rework and can
describe functions that no longer exist (B-19's entry named `handleSyncError`, removed by
B-15/16/17/18 and split into `handleCreateError` / `handleDeleteError` / `recordFailure`).
The task folder's `task.md` Notes section carries the corrections, and `tech-tasks.md`
carries the approved design.
**Why:** reviewing against the backlog produces confident, wrong findings about missing
work that was deliberately descoped.
**How to apply:** always read `<task-folder>/task.md` + `tech-tasks.md` before judging
completeness; treat backlog text as historical.

**Work is sometimes uncommitted on `main`** rather than on a branch, so
`git diff origin/main...HEAD` returns nothing. Fall back to `git status --short` +
`git diff` of the working tree, and note the branch-hygiene gap in the report.

**`useSpacesStore.ts` carries "do not fix this back" invariants** with audit ids — the
`hydrate` error swallow (B-18 U-2), `flush`'s in-flight `finally`, the `hydrateEpoch`
generation guard, and phase-3 zone-delete ordering. Confirm a diff leaves these alone
rather than flagging them as bugs.

**Verification that works here:** `npx vue-tsc --noEmit -p tsconfig.app.json` and
`npx vitest run <file>` both run clean from `src/Tidansu.App` without extra setup.

Related: [[review-recurring-frontend-findings]]
