# Active tasks

One **folder per backlog item** in flight. Each folder is the single source of
context for that task — an agent reads `task.md` first, then its own stage file.
This keeps independent tasks from colliding and lets the pipeline run several in
parallel.

```
docs/active/tasks/
  _TEMPLATE/            ← copy this to start a task (entries prefixed with _ are ignored)
  B-2-shrink-delete-zone-button/
    task.md            ← brief + status: title, description, acceptance criteria, notes, touch points
    requirements.md    ← pm-requirements-analyst output
    tech-tasks.md      ← tech-lead output (the developer's checklist)
    review.md          ← branch-code-reviewer output
```

## Folder naming

`<backlog-id>-<kebab-slug>` — e.g. `B-4-real-login-email`. The id ties it back to
`docs/backlog.md`.

## `task.md` is the contract

Every agent **reads `task.md` first** (it's the compact, self-contained brief) and
**updates its `status:`** when it finishes its stage. Stage files hold the detail;
`task.md` holds the summary + current state, so a fresh agent gets full context
from one short read.

## Status lifecycle

`draft` → `requirements` → `tech-planning` → `in-progress` → `in-review` → `done`
(plus `blocked` when a `depends-on` task hasn't landed). The human approval gates
live **between** `requirements`→`tech-planning` and `tech-planning`→`in-progress`.

## When a task is `done`

Leave the folder in place as the record for that slice. (Archiving/pruning is a
manual housekeeping step, not part of the flow.)
