# Tidansu agent workflow (harness engineering)

A four-stage feature pipeline, ported from a FastAPI/React setup and retargeted to
Tidansu's **.NET 10 Clean Architecture + CQRS** backend and **Vue 3** frontend,
plus two specialist reviewers and a design engineer. Every agent is tuned to this
repo's conventions (`CLAUDE.md` + `.claude/context/*.md`) and **verifies by build
+ type-check + driving the app** — there is no integration or E2E suite, so a real
drive is the bar for anything with a runtime surface. The one exception is
`tests/Tidansu.Domain.Tests`, an xUnit project covering **pure Domain logic only**
(`PlanPolicy`, `PhotoPolicy`). Pure, dependency-free Domain rules belong there and
must ship with tests; everything else is still proven by driving.

## The pipeline

```
docs/backlog.md
      │  (orchestrator seeds a task folder from _TEMPLATE: docs/active/tasks/<id>-<slug>/task.md)
      ▼
docs/active/tasks/<id>-<slug>/task.md   ← compact brief + status:, every agent reads it first
      │  pm-requirements-analyst   (business language, phased, plan-gated)
      ▼
.../<id>-<slug>/requirements.md   ──[human approves]──┐
      │  tech-lead   (ordered tasks, file paths, migrations, Kiota regen, security)
      ▼
.../<id>-<slug>/tech-tasks.md     ──[human approves]──┐
      │  feature-developer   (ONE task at a time; dotnet build + npm run build + drive app)
      ▼
   working code               ──[all tasks checked]──┐
      │  branch-code-reviewer  (+ security-reviewer if the diff changes auth/billing/plan/redirect/photo *logic or data flow*)
      ▼
.../<id>-<slug>/review.md
```

**Right-size the pipeline to the task.** The full four-stage / six-agent flow is
built for a *feature build*. A verification/hardening sweep, a small config/copy
change, or a one-file fix should run a **light path** — a short requirements note,
one developer run for the whole coherent diff, and a **single** reviewer with
trivial findings applied **inline** by the orchestrator (no fresh developer for
~15 lines). Reserve the full path — and the second (security) reviewer — for diffs
that change real logic on a sensitive surface, add/alter a contract or schema, or
span many files/layers. `/build-feature` judges this twice: a first guess from the
backlog item, a firm call once `tech-tasks.md` reveals the true size.

**One folder per task** (`docs/active/tasks/<id>-<slug>/`) is the unit of work and
the single source of context — see `docs/active/tasks/README.md`. Each stage reads
`task.md` first and writes its own file into the same folder, so independent tasks
never collide and requirements/tech-planning can run in **parallel** (implementation
serializes when tasks share files).

Run it end-to-end with the **`/build-feature`** slash command (it dispatches each
agent and stops at every human gate), or invoke any agent directly by name.

## Agents

All paths below are inside the task folder `docs/active/tasks/<id>-<slug>/`.

| Agent | Role | Reads | Writes |
|---|---|---|---|
| `pm-requirements-analyst` | Backlog item → functional requirements (business language, phased, plan-gated) | `task.md`, `docs/backlog.md`, `CLAUDE.md` | `requirements.md` (+ updates `task.md`) |
| `tech-lead` | Requirements → ordered technical tasks with exact file paths, migration/Kiota tasks, security & scalability notes | `task.md`, `requirements.md`, context rules, code | `tech-tasks.md` (+ updates `task.md`) |
| `feature-developer` | Implements one approved task; verifies via build + type-check + driving the app | `task.md`, `tech-tasks.md`, touched files | code + checks the task box (+ `task.md` status) |
| `branch-code-reviewer` | Full branch review vs `origin/main`, prioritized findings | branch diff, `task.md`, `CLAUDE.md` | `review.md` (+ updates `task.md`) |
| `security-reviewer` | Deeper security audit (IDOR, plan bypass, auth, billing, redirects, file handling) | branch diff or full sweep | `docs/security-review-YYYY-MM-DD-*.md` |
| `design-ui-engineer` | Visual reference → Vue components obeying variant/token/template-purity rules | design reference, `style.css`, base components | Vue components |

`/build-feature` (in `.claude/commands/`) is the orchestrator — it's a slash
command, not an agent, because subagents can't spawn other subagents.

## Model tiers (cost/effectiveness tuning)

Not every stage needs Opus. We keep Opus only where deep reasoning changes the
outcome **and** a mistake is expensive or hard to catch downstream; the rest run on
Sonnet, protected by objective gates.

| Agent | Model | Rationale |
|---|---|---|
| `tech-lead` | **opus** | Highest-leverage stage — a bad plan multiplies cost across every downstream dispatch. |
| `branch-code-reviewer` | **opus** | Subtle-bug hunting; false negatives are invisible and costly. |
| `security-reviewer` | **opus** | High-stakes (IDOR, plan-bypass, billing) with no mechanical safety net. |
| `feature-developer` | **sonnet** | Highest-volume agent (per-task cold starts + drives the app), but tightly scoped with hard gates (`dotnet build`, `vue-tsc`, drive-the-app) that catch errors mechanically. |
| `design-ui-engineer` | **sonnet** | Component codegen against strict, well-specified rules with a `vue-tsc` gate. |
| `pm-requirements-analyst` | **sonnet** | Structured business-language writing into a fixed template; no code reasoning. |

Rule of thumb when adding an agent: **Sonnet if an objective gate verifies its
output; Opus if nothing downstream mechanically catches a weak result.** Don't drop
reasoning-only stages (requirements/planning/review) to Haiku — they have no safety
net.

## Conventions baked into every agent

- **Domain = spatial inventory** (spaces → zones → items, expiry). *Ignore
  `.claude/context/project-overview.md`* — it's a stale SelfGrind task/XP leftover;
  `CLAUDE.md` is authoritative.
- **Plan limits are core logic:** check the cap **before** every mutation; on cap
  throw `PlanLimitException` with the right `reason` (`spaces | zones | items |
  photos | sync`); the frontend opens the paywall on a 403 `{plan:[reason]}`;
  downgrade keeps data but makes over-cap content read-only.
- **Backend:** CQRS triplet (Command/Handler/Validator), repository interface in
  Domain + impl in Infrastructure, controllers only `mediator.Send`, domain
  exceptions mapped by `ErrorHandlingMiddleware`. Model change → EF migration.
- **Frontend:** variant `Record` class maps, `@theme` tokens only (no hex), static
  Tailwind classes, `computed` for all derived values, named handlers only, the
  **template-purity HARD RULE**, and Kiota regen (`npm run build:api`) after any
  API contract change (never hand-edit `src/api/apiClient/`).
- **Verification (no test suite):** `dotnet build` + `npm run build` (vue-tsc) +
  an end-to-end **drive** of the flow, always exercising the plan-cap path where
  relevant.

## Skills wiring

Each agent has a **Skills to use** section pointing it at the installed engineering
skills (Matt Pocock's `.agents/skills` + the `superpowers` plugin) it should invoke
inline at the right moment — e.g. `feature-developer` → `superpowers:test-driven-
development` / `systematic-debugging` / `verification-before-completion`,
`pm-requirements-analyst` → `superpowers:brainstorming`, reviewers →
`receiving-code-review` / `diagnosing-bugs`.

Skills that **fan out into parallel sub-agents** (`/code-review`, `design-an-
interface`, `improve-codebase-architecture`, `research`, superpowers'
`dispatching-parallel-agents`) can't run *inside* an agent — a sub-agent can't spawn
sub-agents. Those are reserved for the **top level**: run them from the main session
or via `/build-feature` (see its "Skills you can run at the orchestration level").

Issue-tracker, triage-label, and domain-doc conventions the skills read live in
`docs/agents/` (set up via `/setup-matt-pocock-skills`) and are summarized in
`CLAUDE.md` under **## Agent skills**.

## Agent memory

Each agent declares `memory: project` and accumulates durable, repo-specific
knowledge across sessions. They're instructed not to duplicate anything already in
`CLAUDE.md` or the context files.
