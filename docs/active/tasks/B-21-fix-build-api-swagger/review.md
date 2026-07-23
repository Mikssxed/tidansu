# Code Review: B-21 · Fix `npm run build:api` (build-time OpenAPI generation)

**Date**: 2026-07-23
**Reviewer**: branch-code-reviewer agent
**Diff base**: origin/main (uncommitted working tree on `main`)
**Files changed (this run)**: `src/Tidansu.API/Tidansu.API.csproj`, `src/Tidansu.App/package.json`, `src/Tidansu.App/package-lock.json`, `src/Tidansu.App/src/api/copy-openapi.mjs` (new), `.config/dotnet-tools.json` (new), `CLAUDE.md`, `docs/backlog.md`, plus docs + agent-memory

## Summary
Solid, well-scoped tooling fix. `swagger tofile` is replaced by build-time OpenAPI emission via `Microsoft.Extensions.ApiDescription.Server`, gated off by default (`OpenApiGenerateDocumentsOnBuild=false`) and opted into only by the regen script; `kiota` is pinned in a local tool manifest. FR-3 contract fidelity is verified in the tree — `src/api/apiClient` and `api.json` have an empty diff, and the copy step correctly resolves the single emitted `api.json`. The one substantive gap is that the change ships a documentation claim ("no DB, only `dotnet tool restore`") that the developer's own investigation already contradicts: generation runs `Program.cs` to the migration-on-boot block and touches LocalDB.

## 🔴 Critical (must fix before merge)
None.

## 🟠 Major (strongly recommended)

### [M1] `build:api` touches LocalDB, contradicting the "no DB" clean-clone claim (FR-1 / FR-4)
**File**: `src/Tidansu.App/package.json:12`; `CLAUDE.md:27-32`; corroborated by `.claude/agent-memory/feature-developer/build-time-openapi-getdocument-runs-startup-code.md`
**Category**: Functional (FR-1 clean-clone, FR-4 doc accuracy)
**Description**: The getdocument tool does not stop at `builder.Build()` — it executes the full top-level `Program.cs` body up to `app.Run()`, including the migration-on-boot block (`Program.cs:18-25`). That block runs whenever a connection string is present, and it is: `appsettings.Development.json` defines `ConnectionStrings:TidansuDb` (LocalDB), and `build:api-file` runs under `ASPNETCORE_ENVIRONMENT=Development`, so the Development config is loaded and `dbContext.Database.Migrate()` fires real queries against LocalDB. On the existing team's machines this only works because LocalDB is already present and migrated. On a genuinely clean clone with the documented toolchain but no LocalDB (the exact FR-1 scenario, and any Linux/CI runner), `Migrate()` throws and `build:api` fails. Meanwhile `CLAUDE.md` now asserts generation happens "with no running host, no DB migration curl, no manual steps. The only prerequisite is `dotnet tool restore`." That is not literally true, and it re-introduces the trap-for-newcomers problem this ticket exists to remove.
**Recommendation**: Make the "no DB" claim true rather than documenting a DB prerequisite — clear the connection string for the generation step so the `Program.cs:20` guard skips the migration block. `cross-env` already sets multiple vars:
```json
"build:api-file": "cross-env ASPNETCORE_ENVIRONMENT=Development ConnectionStrings__TidansuDb= dotnet build ../Tidansu.API/Tidansu.API.csproj -c Debug -p:OpenApiGenerateDocumentsOnBuild=true && node ./src/api/copy-openapi.mjs",
```
This keeps `Development` (so the `AddPresentation` fail-loud secret guards stay inert) while making the migration block a no-op — no DB, no LocalDB, genuinely hostless, and the OpenAPI doc is unaffected (it comes from ApiExplorer metadata, not the DB). If instead the team prefers to keep the DB in the loop, then FR-4 requires `CLAUDE.md` to list LocalDB (provisioned + migrated) as a prerequisite and drop the "no DB" wording.

## 🟡 Minor (nice-to-have)

### [N1] `IncludeAssets="runtime; …"` on a build-only tool package is imprecise
**File**: `src/Tidansu.API/Tidansu.API.csproj:31-34`
**Category**: Convention / build hygiene
**Description**: `Microsoft.Extensions.ApiDescription.Server` is added with `PrivateAssets="all"` (correct) but also `IncludeAssets="runtime; build; native; contentfiles; analyzers; buildtransitive"`, copied from the EF Tools entry. For a pure build/tools package the tech-tasks specified only `PrivateAssets="all"`; explicitly opting `runtime` in is unnecessary. The package ships no meaningful runtime lib so the practical footprint is nil, but the tech-tasks security checklist item ("verify the package does not appear in the published output") is still unchecked.
**Recommendation**: Drop the `IncludeAssets` line (leave just `PrivateAssets="all"`), or run one `dotnet publish` and confirm no `GetDocument`/`ApiDescription` assemblies land in the publish output, then check that box.

### [N2] `copy-openapi.mjs` emits a cryptic error if `obj/openapi` is missing entirely
**File**: `src/Tidansu.App/src/api/copy-openapi.mjs:10`
**Category**: Correctness / failure mode
**Description**: The friendly "did the build:api-file step run?" guard only fires once the directory exists and contains zero `.json`. If the directory itself is absent (generation skipped — e.g. the `obj/*.OpenApiFiles.cache` up-to-date no-op the developer documented, or the `-p:` flag not passed), `readdirSync` throws a raw `ENOENT` instead. Low impact in the normal chained flow (the preceding `dotnet build` creates it), but the guard is one `existsSync` away from covering the case it's clearly meant to.
**Recommendation**: Guard the directory read (`if (!existsSync(sourceDir)) throw new Error('… build:api-file did not emit obj/openapi — was -p:OpenApiGenerateDocumentsOnBuild=true passed?')`).

### [N3] `build:api` does not run `dotnet tool restore`
**File**: `src/Tidansu.App/package.json:11,14`
**Category**: Robustness (FR-1)
**Description**: `build:api-client` calls `dotnet tool run kiota`, which requires a prior `dotnet tool restore`. This is documented in `CLAUDE.md` as a one-time prerequisite (acceptable for FR-4), but a clean-clone `npm run build:api` without that step fails at the client stage. Prepending `dotnet tool restore` (idempotent, fast when already restored) to the chain would make the single command genuinely self-contained per FR-1.
**Recommendation**: Optional — add `dotnet tool restore &&` in front of the `build:api-client` step, or leave documented. Low priority.

## 🧭 Convention Violations (project rules)
- None. No frontend/template surface touched; no layer, Kiota-hand-edit, or hex-token concerns apply to this diff.

## 🏗️ Architecture Notes
- Approach matches the tech-tasks decision faithfully: no `AddOpenApi()` was added (confirmed — only `AddSwaggerGen` is registered in `WebApplicationBuilderExtensions.cs:119`), so Swashbuckle's `IDocumentProvider` remains the sole provider and FR-3 holds. `Program.cs` and `WebApplicationBuilderExtensions.cs` are untouched, as planned.
- `OpenApiGenerateDocumentsOnBuild=false` correctly gates normal `dotnet build` / `dotnet ef` — those run the build but never emit the doc. Good FR-5 posture.
- `copy-openapi.mjs` glob-with-fail-loud-on-ambiguity is the right robustness choice for the uncertain emitted filename (Open Question 2); the tree confirms a single `api.json`, so it resolves unambiguously today and will shout rather than silently pick the wrong file if the naming ever changes.
- Finding 2 from the developer memory (the `obj/*.OpenApiFiles.cache` up-to-date no-op) does **not** undermine any requirement: in the real npm flow a skip means "nothing changed → same content," which is exactly FR-2 idempotence. It only bites manual `rm obj/openapi` probing. No action needed beyond the memory note that already exists.

## 👍 Positives
- FR-3 verified in-tree: `git status src/api/` shows an empty diff on `apiClient/` and `api.json` after the regen — byte-identical client, the real bar.
- `kiota` pinned via `.config/dotnet-tools.json` (`rollForward:false`, exact `1.32.5`) kills the version-pinning tribal knowledge — directly serves FR-1/FR-4.
- `cross-env` is the correct cross-platform choice for the env var, and the Development-env rationale (keeping the fail-loud secret guards inert) is sound and correctly implemented.
- `Swashbuckle.AspNetCore.Cli` global tool fully dropped; backlog follow-up (B-28 CI drift-check) filed as its own item per the requirements' process suggestion.
- Thorough, honest developer memory — Finding 1 (the LocalDB touch) is precisely the gap M1 formalizes; the developer surfaced it rather than hiding it.

## Action Checklist
- [x] [M1] Add `ConnectionStrings__TidansuDb=` to the `build:api-file` env so generation skips the migration block (or document LocalDB as a prerequisite in `CLAUDE.md`).
- [~] [N1] Drop `IncludeAssets` from the `ApiDescription.Server` ref — **declined** (won't-do): harmless redundancy on a build-only `PrivateAssets="all"` ref; publish output already verified to carry no `ApiDescription` assembly.
- [x] [N2] Add an `existsSync(sourceDir)` guard in `copy-openapi.mjs`.
- [x] [N3] Optionally prepend `dotnet tool restore` to the `build:api` chain.

## Resolution (orchestrator, inline — 2026-07-23)
Applied on the light path, re-verified by driving the regen:
- **[M1] fixed** — `build:api-file` now runs under `ConnectionStrings__TidansuDb=`
  (empty). The `Program.cs:19-20` guard skips `Database.Migrate()`, so getdocument
  resolves the host and emits the doc **without touching LocalDB**. "No DB needed" is
  now literally true, so `CLAUDE.md` needed no wording change. Verified: the run-2
  build log contains **no** migration/SQL/LocalDB lines.
- **[N3] fixed** — `build:api-client` now runs `dotnet tool restore &&` before
  `dotnet tool run kiota`, so a clean clone self-restores the pinned kiota (FR-1).
- **[N2] fixed** — `copy-openapi.mjs` guards `existsSync(sourceDir)` with a friendly
  error before `readdirSync` (no raw ENOENT).
- **[N1] left as-is** — harmless redundant `IncludeAssets` on a build-only
  (`PrivateAssets="all"`) package ref; publish was already verified to carry no
  `ApiDescription` assembly.

**Re-verification after fixes:** `npm run build:api` run twice back-to-back →
`git diff src/api/` **empty** both times (FR-3 fidelity + FR-2 idempotence held with
the empty connection string in place). FR-6 memory note (`kiota-regen-tooling.md`)
rewritten by the orchestrator to describe the working one-command flow.
