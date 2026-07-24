### 📋 Backlog Item
Stand up a CI workflow (none currently exists in this repo) whose job is to catch a
committed Kiota API client that has drifted out of sync with the backend contract,
by re-running the B-21 one-command regen and failing the build if it produces a diff.

### 🎯 Product Context Summary
This is developer-tooling correctness infrastructure, not a user-facing feature —
Tidansu's end users never see it, and it has no Free/Pro or spatial-model dimension.
The problem it solves is real product risk by proxy: if a backend contract change
lands without a client regen, the SPA keeps calling the old shape and nothing fails
until a user hits a broken request at runtime — possibly against paywall-gated or
data-mutating endpoints. B-21 made the regen a reliable, deterministic one-command,
idempotent operation; this item turns "did anyone remember to run it" from an honor
system into an automated, red/green gate. **Material framing correction from the
task brief:** the backlog wrote this as "add a CI step," but the repo has **no CI
pipeline at all** (no `.github/workflows/`). The actual deliverable is therefore to
stand up the first GitHub Actions workflow this repo has ever had, not to insert a
step into an existing one.

### 🔑 Core Functional Areas
- Stand up a first CI workflow for the repo (GitHub Actions, `Mikssxed/tidansu`)
- Drift check: regenerate the Kiota client in CI and fail on non-empty diff
- Clear, actionable failure feedback (what happened, what to run locally to fix it)
- Trigger scope decision (which events run the check)
- Workflow scope decision (drift-only vs. drift + basic build gate)
- No dependency on a running host/DB inside CI (must reuse B-21's build-time OpenAPI generation)

---

### Functional Requirements

**Stand up the CI workflow**
- **FR-1**: The repository must gain a CI workflow definition (GitHub Actions) where
  none exists today — this is new infrastructure, not an addition to an existing
  pipeline.
  - *Business rationale*: There is currently zero automated gate on any PR in this
    repo; every check (build, drift, anything else) is manual-or-nothing today.
    This item is the first crack at that, scoped narrowly to the drift problem that
    motivated it.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A (developer tooling)
  - *Constraints/Rules*: Must run on GitHub-hosted runners against `Mikssxed/tidansu`;
    must not require any secrets, external services, or a deployed environment.
  - *Acceptance criteria*: A workflow file exists in the repo and visibly runs
    (shows up as a check) on a real PR.

**Kiota drift detection**
- **FR-2**: On the triggering event, CI must run a fresh Kiota client regeneration
  using the exact same one-command flow B-21 established (`dotnet tool restore` then
  `npm run build:api` from `src/Tidansu.App`) and compare the result against the
  committed client.
  - *Business rationale*: This is the core value of the item — turning a silent,
    discover-later contract mismatch into an immediate, attributable red check on
    the PR that caused it.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A
  - *Constraints/Rules*: No running API host, no database, no manual curl step — the
    B-21 flow's whole point was to make this possible via build-time OpenAPI
    generation; the CI runner needs the .NET 10 SDK and Node.js provisioned, plus
    `dotnet tool restore` so `kiota` resolves to the version pinned in
    `.config/dotnet-tools.json`. The check must fail whenever the regenerated output
    differs from what's committed under the client's output directory, in any way
    (added/removed/changed files) — not just semantic API-surface changes.
  - *Acceptance criteria*: A PR with an up-to-date committed client passes the check.
    A PR that changes the backend contract (or otherwise deliberately staled the
    committed client) without regenerating fails the check.

**Actionable failure feedback**
- **FR-3**: When the drift check fails, the CI output must clearly state that the
  committed API client is out of date and tell the developer exactly what to run
  locally to fix it (the B-21 one-command regen), not just report a generic
  nonzero-exit failure or a raw diff dump.
  - *Business rationale*: A red check that doesn't explain itself just relocates the
    confusion instead of removing it — someone unfamiliar with the regen flow
    shouldn't have to go spelunking through workflow YAML to learn the fix is
    "run `npm run build:api`."
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: N/A
  - *Constraints/Rules*: The message should reference the specific command(s) from
    B-21's flow and, ideally, point at `CLAUDE.md`'s documented `build:api` section.
  - *Acceptance criteria*: A deliberately staled client produces a CI failure whose
    log output names the fix command in plain text, without requiring the reader to
    interpret a raw `git diff`.

---

### ⚠️ Key Business Considerations
- **This is the repo's first CI workflow.** Whatever scope is chosen here sets the
  precedent for how future CI items (test running, deploy gates, lint) get added —
  worth being deliberate rather than backing into it as a side effect of the drift
  check alone.
- **A red check that's wrong or noisy erodes trust fast.** Since B-21 already proved
  the regen is byte-identical and idempotent (round-trip `git diff` is empty on an
  unchanged backend), the check should be reliable from day one — a flaky drift
  check (e.g. from nondeterministic tool versions not being pinned in CI the same
  way as locally) would train contributors to ignore red, defeating the purpose.
  Reusing `.config/dotnet-tools.json`'s pinned `kiota` version in CI (not a
  independently-resolved version) is what keeps this from happening.
- **Cost/benefit of scope.** Every additional job in the workflow (build gate, etc.)
  adds maintenance surface and CI minutes; the drift check alone is cheap and
  narrowly justified by this backlog item. Broadening scope is a legitimate
  "while we're here" call, but it's explicitly a product/process decision, not
  something to resolve unilaterally in requirements.

### 🚫 Out of Scope (Phase 1)
- Running the test suite (no automated tests are described as in scope here).
- Deployment or release automation of any kind.
- A full CI matrix (multiple OS/SDK versions, caching strategy, parallelization).
- Linting/formatting gates beyond what's decided in the build-gate scope question.
- Any change to the regen flow itself — this item consumes the B-21 flow as-is; if
  the regen breaks or needs fixing, that's a B-21-adjacent bug, not this item.
- Enforcing the check as a required/blocking PR status (branch protection settings)
  — worth calling out explicitly below as a question, since a check that exists but
  isn't required to pass provides much weaker protection.

### ❓ Open Questions for Product Owner

1. **Workflow scope — Option A vs. Option B.**
   - **Option A (minimal):** One workflow, one job — the Kiota drift check only
     (checkout → setup .NET 10 SDK + Node → `dotnet tool restore` →
     `npm ci`/`npm run build:api` → fail on non-empty `git diff`). Nothing else
     gates the PR.
   - **Option B (CI baseline):** The same drift check, plus a basic build gate
     (`dotnet build` and `npm run build`) in the same or a sibling job, so PRs get
     a minimal green/red signal on basic compileability, not just client drift.
   - **Tradeoff:** Option A ships the narrowly-scoped thing the backlog item asked
     for with minimal new surface area, but leaves PRs with *no* other automated
     safety net — a PR that fails to build entirely would only be caught by the
     drift job accidentally (or not at all, if the drift job also fails to even
     run in a broken build state). Option B gives real value beyond this ticket's
     stated scope, at the cost of scope creep on a "should be light" item and
     slightly more workflow to maintain.
   - **Recommendation:** Option B. This is the repo's very first CI workflow — if
     product accepts a small amount of extra scope now, "PRs at least build" is a
     natural and cheap companion to "PRs don't silently ship a stale client," and
     avoids standing up CI twice in quick succession. But this is explicitly a
     scope call for the human, not resolved here.

2. **Trigger events — which events run the check?**
   - Options: PR only (opened/synchronize against `main`), PR + push to `main`, or
     PR + push to any branch.
   - **Tradeoff:** PR-only catches drift before merge (the point of the check) with
     the least CI usage. Adding push-to-`main` is redundant if merges are always
     gated by the PR check, but acts as a safety net for any merge path that
     bypasses PR review (e.g. an admin merge or a direct push).
   - **Recommendation:** PR-only (against `main`), since that's where the check
     actually prevents the bad outcome (merging a stale client). Add push-to-`main`
     later only if direct pushes to `main` turn out to be a real workflow in this
     repo.

3. **Should this check be a required status check on `main`'s branch protection?**
   A workflow that runs but isn't required to pass before merge is a weaker
   guarantee than the acceptance criteria implies ("fails a PR"). Confirm whether
   branch protection should be configured as part of this item, or is a separate
   repo-admin action outside requirements/tech-planning scope.
