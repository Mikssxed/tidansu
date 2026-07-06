# Tidansu agent workflow (harness engineering)

A four-stage feature pipeline, ported from a FastAPI/React setup and retargeted to
Tidansu's **.NET 10 Clean Architecture + CQRS** backend and **Vue 3** frontend,
plus two specialist reviewers and a design engineer. Every agent is tuned to this
repo's conventions (`CLAUDE.md` + `.claude/context/*.md`) and **verifies by build
+ type-check + driving the app** — this repo has no automated test suite.

## The pipeline

```
docs/backlog.md
      │  pm-requirements-analyst   (business language, phased, plan-gated)
      ▼
docs/active/requirements.md   ──[human approves]──┐
      │  tech-lead   (ordered tasks, file paths, migrations, Kiota regen, security)
      ▼
docs/active/tech-tasks.md     ──[human approves]──┐
      │  feature-developer   (ONE task at a time; dotnet build + npm run build + drive app)
      ▼
   working code               ──[all tasks checked]──┐
      │  branch-code-reviewer  (+ security-reviewer if auth/billing/plan/redirect/photo)
      ▼
docs/active/review/YYYY-MM-DD-<branch>.md
```

Run it end-to-end with the **`/build-feature`** slash command (it dispatches each
agent and stops at every human gate), or invoke any agent directly by name.

## Agents

| Agent | Role | Reads | Writes |
|---|---|---|---|
| `pm-requirements-analyst` | Backlog item → functional requirements (business language, phased, plan-gated) | `docs/backlog.md`, `CLAUDE.md` | `docs/active/requirements.md` |
| `tech-lead` | Requirements → ordered technical tasks with exact file paths, migration/Kiota tasks, security & scalability notes | `docs/active/requirements.md`, context rules, code | `docs/active/tech-tasks.md` |
| `feature-developer` | Implements one approved task; verifies via build + type-check + driving the app | `docs/active/tech-tasks.md`, touched files | code + checks the task box |
| `branch-code-reviewer` | Full branch review vs `origin/main`, prioritized findings | branch diff, `CLAUDE.md` | `docs/active/review/YYYY-MM-DD-<branch>.md` |
| `security-reviewer` | Deeper security audit (IDOR, plan bypass, auth, billing, redirects, file handling) | branch diff or full sweep | `docs/security-review-YYYY-MM-DD-*.md` |
| `design-ui-engineer` | Visual reference → Vue components obeying variant/token/template-purity rules | design reference, `style.css`, base components | Vue components |

`/build-feature` (in `.claude/commands/`) is the orchestrator — it's a slash
command, not an agent, because subagents can't spawn other subagents.

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
