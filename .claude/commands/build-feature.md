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

> **Cost tip:** orchestration here is coordination only — dispatch, summarize,
> gate. The real reasoning is delegated to model-tiered subagents (see
> `.claude/agents/README.md`). Running *this* session on **Sonnet** (`/model
> sonnet`) is cheaper with no quality loss; the agents still pick their own tier.

If `$ARGUMENTS` is empty, read `docs/backlog.md` and propose the highest-priority
`unprocessed` item, then confirm with the user before starting.

## Task folders (the unit of work)

Each backlog item in flight gets its own folder under `docs/active/tasks/`
(`<id>-<slug>/`, see `docs/active/tasks/README.md`). It holds `task.md` (the
compact brief + `status:`) and the stage files `requirements.md`, `tech-tasks.md`,
`review.md`. **Every agent reads that folder's `task.md` first** and writes its
stage output into the same folder — so a fresh agent gets full context from one
short read, and independent tasks never collide.

**Starting a task:** if the folder doesn't exist yet, create it from
`docs/active/tasks/_TEMPLATE/` and seed `task.md` (id, slug, title, description,
acceptance criteria, notes, touch-points) from the backlog item. Always pass each
agent the **exact task-folder path**.

**Parallelism:** the requirements and tech-planning stages of *independent* tasks
may be dispatched in **parallel** (each writes only into its own folder). But
**serialize implementation** whenever two tasks touch the same files (or share a
`depends-on`); build produces one coherent diff at a time. Note conflicts in each
`task.md`'s `## Notes`.

## Pipeline

### Right-size the pipeline to the task (decide up front, revisit after Stage 2)

The full four-stage / six-agent pipeline is built for a **feature build**. Many
backlog items — a verification/hardening sweep, a small config or copy change, a
one-file fix — don't need all of it, and running the heavyweight pipeline on them
burns tokens on cold-start re-derivation for no added safety. Judge the weight
**twice**: a first guess from the backlog item, then a firm call once
`tech-tasks.md` exists (its plan reveals the true size).

Collapse toward the **light path** when the tech-lead plan is *all* of: ≤ ~4 small
edits, **no** schema migration, **no** new endpoint/contract (no Kiota regen), and
**no** change to auth/billing/ownership/plan-limit *logic* (config or guards that
merely *protect* those surfaces still count as light). On the light path:
- Requirements may be a short note rather than a full multi-FR document (still gate it).
- Prefer **one** developer run for the whole coherent diff (see batching, Stage 3).
- Run a **single** reviewer (Stage 4) and allow **inline fixes** for trivial findings.

Stay on the **full path** whenever the diff changes real logic on a sensitive
surface (auth, billing, ownership, plan gating), adds/changes a contract or schema,
or spans many files/layers. When in doubt, go heavier — but say which path you
picked and why, so the user can correct you at the first gate.

**Stage 1 — Requirements.** Dispatch the `pm-requirements-analyst` agent (naming
the task folder) to expand the item into `<task-folder>/requirements.md` and update
`task.md`. When it returns, show the user a brief summary and **STOP**: ask them to
review `<task-folder>/requirements.md` and approve or request changes. Loop the PM
agent until approved.

**Stage 2 — Technical tasks.** Once requirements are approved, dispatch the
`tech-lead` agent (naming the task folder) to write `<task-folder>/tech-tasks.md`.
When it returns, surface the Open Questions and any 🔴/🟠 security items and
**STOP**: ask the user to review the task list and resolve open questions. Loop the
tech-lead agent until approved.

**Stage 3 — Implementation.** For each unchecked, unblocked task in
`<task-folder>/tech-tasks.md`, **in order**, dispatch the `feature-developer` agent
(naming the task folder) to implement exactly that one task (it verifies via
`dotnet build` + `npm run build` + driving the app, and checks the box). After each
task, report status. Pause for the user if a task touches auth, billing, plan
limits, or a schema migration — or if the developer surfaces an ambiguity/
architectural constraint. Continue until all tasks in the folder are checked.

> **Batch tightly-coupled tasks to cut cold-start cost.** Each dispatch is a fresh
> agent that re-reads `task.md` + `tech-tasks.md` + the files it touches. When
> several *adjacent, same-layer* tasks operate on the **same file(s)** (e.g. a CQRS
> triplet, or a component + its composable) and none of them is a gated pause point
> above, dispatch them as **one** developer run ("implement tasks 3–5") so that
> context loads once. Keep tasks separate whenever they touch different files, cross
> a layer boundary, or hit a pause condition — the one-coherent-diff-at-a-time rule
> still holds.

**Stage 4 — Review.** Dispatch the `branch-code-reviewer` agent (naming the task
folder) to review the branch and write `<task-folder>/review.md` — this is the
**single default review**. Add the `security-reviewer` agent **only when the diff
changes auth / billing / ownership / plan-gating / redirect / file-photo *logic or
data flow*** — not merely because it touches a config value that *guards* those
surfaces. (Example: reworking the webhook trust path → run both; adding a fail-loud
startup guard on a config key, or binding proxy trust from config → one
security-lensed reviewer is enough.) Summarize the 🔴 Critical and 🟠 Major findings
and **STOP**: ask the user how to proceed.

- **Apply trivial fixes inline — don't spin up a fresh developer for ~15 lines.**
  When the accepted findings total ≤ ~30 LOC across ≤ 3 files and need no design
  judgement (add a value to a reject list, wrap a parse in `TryParse`, swap a
  predicate), **you** apply them with `Edit` + one `dotnet build` (+ `npm run build`
  if frontend), then re-check. Reserve a `feature-developer` dispatch for fixes that
  are genuinely non-trivial, span layers, or need the app driven to verify.
- **If you do run both reviewers, don't let them re-derive each other.** Either give
  the second reviewer the first's report ("add only net-new findings; don't
  re-report what's already there"), or partition scopes cleanly — branch =
  correctness / convention / scope-creep; security = trust / secret-leak / fail-open
  **only** — so they don't both trace the same block and double-report one bug.

> **Don't stack reviews.** The `branch-code-reviewer` agent and the `/code-review`
> skill (which itself fans out to two sub-agents) overlap heavily — running both
> re-reads the same diff up to four times for little marginal signal. Use
> `/code-review` as an **alternative** to the branch reviewer (e.g. when you
> specifically want the Standards-vs-Spec split), not in addition to it.

## Rules

- Prefer to run one agent at a time so each sees the previous stage's committed
  artifact. Only fan out in parallel when tasks are genuinely independent.
- Never commit, push, or open a PR unless the user asks.
- Keep the user oriented: after each stage, say which artifact was written and
  what the next gate is.
- **Trust the agent's return summary; don't re-read the full artifact to gate.**
  Each agent returns a tight summary (open questions, 🔴/🟠 items) — gate from that.
  Only open the stage file when a gate decision needs a specific detail the summary
  doesn't carry. Re-reading a 400-line `tech-tasks.md` into the orchestrator just to
  restate what the agent already told you is pure token waste.
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
- **At Stage 4**, choose **one** review path: the `branch-code-reviewer` agent
  (default) *or* the repo's **`/code-review`** skill (Standards + Spec in parallel
  sub-agents) — not both, they read the same diff. Add the `security-reviewer`
  agent on top only when the diff changes auth/billing/ownership/plan/redirect/photo
  **logic or data flow** (not for config/guards that merely protect those surfaces).
- **Before declaring the feature done**, apply
  **`superpowers:verification-before-completion`** — evidence (green gates, a real
  drive) before any "it works" claim.
