---
name: workflow-uncommitted-multitask-worktree
description: This repo often has multiple tasks' changes uncommitted together on `main` — reconstruct the per-task diff, don't trust `git diff origin/main` alone
metadata:
  type: feedback
---

When reviewing a task branch here, the changes are frequently **uncommitted
working-tree edits on `main`** (not a real feature branch), and **several tasks'
edits coexist** in that one working tree at once (e.g. B-8 audit + B-9 webhook
hardening reviewed while both were unstaged together).

**Why:** the harness pipeline leaves work unstaged on `main`; `git diff
origin/main...HEAD` can come back empty even when there are changes, because
`main == origin/main` and everything is in the working tree. Different tasks also
land edits in the *same* file (e.g. B-8's JWT env-gate change lived inside
`WebApplicationBuilderExtensions.cs`, a file B-9 also touched).

**How to apply:** (1) If `git diff origin/main...HEAD` is empty, fall back to
`git status --short` + `git diff` on the working tree. (2) Read the task's
`tech-tasks.md` to learn the *intended* file set, then attribute each working-tree
hunk to a task — flag hunks/files that belong to a *different* task as a scope
finding, since a naive `git add -A` commit would bundle them. Cross-check sibling
`docs/active/tasks/*/` folders to confirm which task owns an out-of-scope change.
