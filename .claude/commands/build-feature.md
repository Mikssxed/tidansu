---
description: Run the full harness-engineering pipeline (PM → tech-lead → developer → review) for a backlog item, with human approval gates between stages.
argument-hint: "[backlog id or feature description]"
allowed-tools: Agent, Read, Edit, Write, Glob, Grep, Bash, Skill, AskUserQuestion
---

You are orchestrating Tidansu's feature pipeline for: **$ARGUMENTS**

Subagents cannot spawn other subagents, so **you** (the main conversation) run
this pipeline by dispatching each agent in turn and **pausing at every human
gate**. Do not skip a gate. Do not run the next stage until the artifact from the
previous stage exists and the human has approved it.

If `$ARGUMENTS` is empty, read `docs/backlog.md` and propose the highest-priority
`unprocessed` item, then confirm with the user before starting.

## Pipeline

**Stage 1 — Requirements.** Dispatch the `pm-requirements-analyst` agent to expand
the item into `docs/active/requirements.md`. When it returns, show the user a
brief summary and **STOP**: ask them to review `docs/active/requirements.md` and
approve or request changes. Loop the PM agent until approved.

**Stage 2 — Technical tasks.** Once requirements are approved, dispatch the
`tech-lead` agent to write `docs/active/tech-tasks.md`. When it returns, surface
the Open Questions and any 🔴/🟠 security items and **STOP**: ask the user to
review the task list and resolve open questions. Loop the tech-lead agent until
approved.

**Stage 3 — Implementation.** For each unchecked, unblocked task in
`docs/active/tech-tasks.md`, **in order**, dispatch the `feature-developer` agent
to implement exactly that one task (it verifies via `dotnet build` + `npm run
build` + driving the app, and checks the box). After each task, report status.
Pause for the user if a task touches auth, billing, plan limits, or a schema
migration — or if the developer surfaces an ambiguity/architectural constraint.
Continue until all tasks are checked.

**Stage 4 — Review.** Dispatch the `branch-code-reviewer` agent to review the
branch and write `docs/active/review/YYYY-MM-DD-<branch>.md`. If the feature
touched auth, ownership, plan gating, billing, redirects, or file/photo handling,
**also** dispatch the `security-reviewer` agent. Summarize the 🔴 Critical and
🟠 Major findings and **STOP**: ask the user how to proceed (fix now via the
developer agent, or accept and open a PR).

## Rules

- Prefer to run one agent at a time so each sees the previous stage's committed
  artifact. Only fan out in parallel when tasks are genuinely independent.
- Never commit, push, or open a PR unless the user asks.
- Keep the user oriented: after each stage, say which artifact was written and
  what the next gate is.
- If a design/UI-heavy task appears in Stage 3, you may route it to the
  `design-ui-engineer` agent instead of the generic developer.

## Skills you can run at the orchestration level

You are the main conversation, so — unlike the agents — you *can* run skills that
fan out into parallel sub-agents. Reach for these around the gates:

- **Before Stage 1**, if the backlog item is fuzzy: **`superpowers:brainstorming`**
  to sharpen intent with the user before the PM agent formalizes it.
- **At Stage 2**, when a task hinges on a non-obvious module boundary:
  **`design-an-interface`** (parallel interface exploration) or
  **`improve-codebase-architecture`** (deepening candidates) to inform the tech-lead
  plan. **`research`** for any library/API fact-finding the tech-lead needs.
- **At Stage 4**, alongside the `branch-code-reviewer` agent, you may also run the
  repo's **`/code-review`** skill (Standards + Spec in parallel sub-agents) for a
  second, orthogonal read of the diff.
- **Before declaring the feature done**, apply
  **`superpowers:verification-before-completion`** — evidence (green gates, a real
  drive) before any "it works" claim.
