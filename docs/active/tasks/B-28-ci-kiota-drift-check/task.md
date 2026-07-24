---
id: B-28
slug: ci-kiota-drift-check
title: CI check — fail a PR when the committed Kiota client drifts from a fresh regen
status: done   # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: [B-21]     # B-21 (one-command build:api) is DONE
touch-points:
  - .github/workflows/   # (does not exist yet — see Notes)
  - src/Tidansu.App/package.json   # the build:api script chain from B-21
  - .config/dotnet-tools.json      # pins the kiota CLI (from B-21)
---

# B-28 · CI check — fail a PR when the committed Kiota client drifts from a fresh regen

## Description
Now that `npm run build:api` reliably regenerates the frontend's API client in one
command (B-21, done), a stale committed client is a silent correctness trap: a
backend contract change that nobody regenerates leaves the SPA calling the old
shape with no signal until runtime. A CI check that runs a fresh regen and fails
the build when `git diff` on the generated client is non-empty turns "someone
forgot to regen" into a red check instead of a latent bug.

## Acceptance criteria
- [x] On a PR (and/or push), CI runs a fresh Kiota client regeneration and fails
      if the committed generated client differs from the fresh output.
- [x] The check is reliable/deterministic — a clean, up-to-date client passes; a
      deliberately stale client fails with a clear, actionable message.
- [x] The regen path used is the B-21 one-command flow (`dotnet tool restore` +
      `npm run build:api`), with no manual steps and no running host/DB.

## Notes
- **Material finding (2026-07-24): there is NO CI in this repo yet** — no
  `.github/workflows/`, no CI config of any kind. The backlog item says "Add a CI
  step", but there is no pipeline to add a step to. So this task's real shape is
  **stand up a CI workflow** (GitHub Actions — repo is `Mikssxed/tidansu`) whose
  first/only job is the Kiota drift check. **Scope decision for the requirements
  gate:** (a) minimal — a single workflow that only does the drift check, or (b)
  a slightly broader "CI baseline" that also runs `dotnet build` + `npm run build`
  so the drift job isn't the only thing gating PRs. Recommend surfacing both.
- **Requirements pass (2026-07-24):** see `requirements.md`. Three FRs: stand up
  the workflow, drift detection via the exact B-21 one-command flow, actionable
  failure messaging (name the fix command, don't just dump a diff). Three open
  decisions left for the human/tech-lead gate, not resolved here: (1) workflow
  scope A (drift-only) vs. B (drift + `dotnet build`/`npm run build` baseline) —
  recommended B since this is the repo's first CI workflow; (2) trigger events —
  recommended PR-only against `main`; (3) whether to make the check a required
  branch-protection status on `main` (separate from writing the workflow itself).
- Regen prerequisites established by B-21: `dotnet tool restore` (pins `kiota` via
  `.config/dotnet-tools.json`), then `npm run build:api` in `src/Tidansu.App`
  (build-time OpenAPI generation, no running app/DB). The CI runner needs both
  the .NET 10 SDK and Node.
- B-21 proved the regen is byte-identical + idempotent (run twice → empty
  `git diff src/api/`), which is exactly what makes this check viable.
- **Weight:** likely medium (not the usual light path) — it stands up new CI
  infrastructure, but touches no app runtime logic, no schema, no auth/billing.

- **Tech-planning (2026-07-24):** see `tech-tasks.md`. Key decisions for the dev:
  - One workflow `.github/workflows/ci.yml`, **two parallel jobs** — `build`
    (Scope B: `dotnet build Tidansu.sln` + `npm run build`) and `kiota-drift`
    (the FR-2/FR-3 core). Independent, no `needs:` (separate runners = no shared FS;
    clearer per-concern red/green; parallel is faster). Single-job consolidation is
    the documented fallback if CI minutes bite.
  - Drift scoped to **both** `src/Tidansu.App/src/api/apiClient/` **and**
    `src/api/api.json` (both committed, both regenerated). Mechanism is
    `git add -A` + `git diff --cached --quiet` (bare `git diff` misses new files;
    FR-2 needs added/removed/changed). `.kiota.log` is `*.log`-gitignored so it never
    dirties the diff. Failure emits a `::error::` naming `npm run build:api` (FR-3).
  - `kiota-drift` MUST `dotnet tool restore` (pinned kiota 1.32.5) and `npm ci`
    before `npm run build:api` — `build:api-file` needs the `cross-env` devDep.
  - Setup: `setup-dotnet@v4` + `global-json-file: global.json` (10.0.0 pin);
    `setup-node@v4` Node 22; `npm ci`. `permissions: contents: read`; `pull_request`
    (NOT `pull_request_target`) so fork PRs stay read-only.
  - Open risks: .NET 10 SDK on hosted runners (setup-dotnet downloads it — noted, low);
    branch-protection "required check" is a separate owner action (LOCKED out of scope,
    so until enabled the check runs but doesn't block merge); Node version unpinned
    locally (`.nvmrc`?) — Open Questions in tech-tasks.

## Implementation + verification (2026-07-24)
- Created `.github/workflows/ci.yml` verbatim from the tech-plan's Appendix A
  (`build` + `kiota-drift` jobs, `pull_request` → `main` only, workflow-level
  `permissions: contents: read`, `concurrency` cancel-in-progress group). Confirmed
  before writing that `.config/dotnet-tools.json` (kiota `1.32.5`), `global.json`
  (`10.0.0`/`latestMajor`), and `package.json`'s `build:api*` script chain still
  match what the appendix assumes — no deviations needed.
- Added the optional CLAUDE.md pointer (Commands → Frontend, `build:api` note) —
  CI enforces client freshness on every PR; a red `kiota-drift` check means run
  `npm run build:api`.
- **YAML validity:** no `actionlint`/`pyyaml` available locally; parsed the file
  with the `yaml` npm package already present in `src/Tidansu.App/node_modules`.
  Parsed cleanly with the expected `on`/`permissions`/`concurrency`/`jobs` shape
  (6 steps in `build`, 7 in `kiota-drift`, matching the appendix).
- **Drift-gate reproduction (the core proof):**
  1. `dotnet tool restore` (repo root) → restored pinned kiota `1.32.5`.
  2. `npm run build:api` (in `src/Tidansu.App`) → full B-21 regen chain succeeded,
     no host/DB.
  3. PASS case: `git add -A -- src/Tidansu.App/src/api/apiClient
     src/Tidansu.App/src/api/api.json` then `git diff --cached --quiet` on the same
     paths → **exit code 0**. Confirms the regen is byte-identical to what's
     committed (client freshness holds). Unstaged with `git reset`.
  4. FAIL case: appended `// drift-test-marker` to `apiClient.ts`, re-ran the same
     `git add -A` + `git diff --cached --quiet` → **exit code 1**; `--stat` output
     correctly isolated the one dirtied file. Restored with
     `git checkout -- src/Tidansu.App/src/api/apiClient`; confirmed the scoped
     paths were byte-identical to HEAD afterward (empty `git diff --stat`).
- **Build gate reproduction:** `dotnet build Tidansu.sln -c Release` from repo
  root → succeeded, 0 errors (only pre-existing `NU1903` audit warnings, unrelated
  to this task). `npm run build` (vue-tsc `-b` + vite build) in `src/Tidansu.App`
  → succeeded, type-check clean.
- **Not performed:** opening a real throwaway PR against `main` to exercise the
  actual GitHub-hosted runner path (SDK provisioning, cross-platform `cross-env`
  on Ubuntu). The local reproduction above proves the gate's shell logic and every
  command the workflow runs; the runner-specific behavior is unverified until the
  first real PR. Left as an explicit gap in `tech-tasks.md`'s verification
  checklist for the owner to confirm on the next PR. Branch-protection "required
  check" on `main` also remains a separate, out-of-scope owner action (per the
  LOCKED decisions) — until enabled, the check runs but doesn't block merge.
- Repo left clean: only `.github/workflows/ci.yml` (new) and the `CLAUDE.md` edit
  are attributable to this task; the drift-gate FAIL-case marker was fully
  restored, and no stray regen output was left in the tree (confirmed via
  `git status --porcelain`).

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
