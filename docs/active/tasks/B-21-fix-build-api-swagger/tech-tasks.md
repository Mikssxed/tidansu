# B-21 · Tech tasks — Fix `npm run build:api` (`swagger tofile` can't find a `Startup`)

## Recommended approach (the decision)

**Option 2 — build-time OpenAPI document generation via
`Microsoft.Extensions.ApiDescription.Server`, driven by MSBuild, off by default on
normal builds and opted into by the regen script.** One line why: it produces
**Swashbuckle's own document** (today's source of truth → FR-3 byte-identical) with
**no running host, no DB, and no curl orchestration**, by resolving the app through
the same `HostFactoryResolver` mechanism that `dotnet ef` already uses successfully
against this exact minimal-hosting `Program.cs` (EF migrations work in this repo, so
host resolution is proven).

### Why not the other two

- **Option 1 (promote the running-app fetch).** Proven, but it hard-wires the very
  tribal knowledge FR-1/FR-4 exist to kill: boot the API with an empty connection
  string, wait for readiness, `curl` swagger, kill the process. As an npm script this
  is fragile cross-platform (port collisions, wait-for-ready races, orphaned dotnet
  processes on Windows) and keeps a live host in the loop for a document that needs
  no host. It is the *fallback*, not the fix.
- **Option 3 (`Startup` shim).** Ceremony for a tool's benefit; pollutes `Program.cs`
  with a shape the app doesn't use, and does **not** remove the version-pinned
  `Swashbuckle.AspNetCore.Cli` global tool that is half the pain. Rejected.

### Why Option 2 is safe here specifically (evidence, not hope)

1. **Host resolution is proven.** `dotnet ef migrations add …` has worked throughout
   this project against `src/Tidansu.API/Program.cs` (top-level statements, no
   `Startup`). EF tools and the getdocument tool both build the service provider via
   `HostFactoryResolver`; if one resolves this host, so does the other. The
   Swashbuckle *CLI* fails because it falls back to legacy `Startup` reflection — a
   different, older code path. This approach does not use that path.
2. **Controllers, not minimal endpoints.** The known `ApiDescription.Server`
   limitation (minimal `app.MapGet(...)` endpoints are missing because the host is
   stopped right after `Build()`) does **not** apply — Tidansu's contract is
   100% controller-based (`app.MapControllers()`), discovered from `ApiExplorer` /
   DI, not from middleware registered after `Build()`.
3. **Same generator → same document.** The document is emitted by Swashbuckle's
   registered `IDocumentProvider` (the same `SwaggerGenerator` the running app uses).
   The committed `src/Tidansu.App/src/api/api.json` is a pure Swashbuckle doc — `info`
   + `paths` only, **no `servers` block** and no request-context fields (base URL is
   set client-side via `adapter.baseUrl = window.location.origin` in
   `useApiClient.ts`). So there is nothing in it that a hostless build-time run would
   populate differently. The implicit `"v1"` doc (title `Tidansu.API`, version `1.0`)
   is Swashbuckle's default — unchanged.
4. **No DB, no secrets.** getdocument stops at `builder.Build()`, so the
   `dbContext.Database.Migrate()` block (which already no-ops on an empty connection
   string) never runs and no SQL Server is needed. The JWT-secret and FrontendUrl
   fail-loud guards in `AddPresentation` are gated on `!IsDevelopment()` — so long as
   generation runs as **Development**, they stay inert (see ⚠️ on the script task).

---

## 1. 📋 Technical Tasks

### Backend — Build configuration (`Tidansu.API`)

- [x] add `Microsoft.Extensions.ApiDescription.Server` (latest `10.0.x`, e.g.
  `10.0.9`) as a `PackageReference` with `PrivateAssets="all"` in
  `src/Tidansu.API/Tidansu.API.csproj`
  - Build-only tooling; `PrivateAssets="all"` keeps it out of the runtime output and
    off downstream project graphs (FR-5 — zero runtime footprint).
  - ⚠️ Do **not** call `builder.Services.AddOpenApi()` and do **not** add
    `Microsoft.AspNetCore.OpenApi`'s document provider. We want Swashbuckle's
    `IDocumentProvider` to be the *only* one registered so getdocument emits the
    Swashbuckle `"v1"` doc (the committed source of truth). Adding the built-in
    provider would introduce a second, differently-shaped document and break FR-3.

- [x] add the OpenAPI-generation MSBuild properties to
  `src/Tidansu.API/Tidansu.API.csproj` (new `<PropertyGroup>`):
  ```xml
  <PropertyGroup>
    <!-- B-21: build-time OpenAPI doc emission for the Kiota regen (npm run build:api).
         OnBuild=false keeps normal `dotnet build` / `npm run build` untouched (FR-5);
         the regen script opts in with -p:OpenApiGenerateDocumentsOnBuild=true. -->
    <OpenApiGenerateDocuments>true</OpenApiGenerateDocuments>
    <OpenApiGenerateDocumentsOnBuild>false</OpenApiGenerateDocumentsOnBuild>
    <OpenApiDocumentsDirectory>$(MSBuildProjectDirectory)/obj/openapi</OpenApiDocumentsDirectory>
    <OpenApiGenerateDocumentsOptions>--file-name api</OpenApiGenerateDocumentsOptions>
  </PropertyGroup>
  ```
  - ⚠️ `OpenApiGenerateDocumentsOnBuild=false` is load-bearing for FR-5: with it
    true, **every** `dotnet build` would regenerate and rewrite the doc (slower builds
    + spurious churn). Off-by-default means the file is produced *only* when the regen
    script passes `-p:OpenApiGenerateDocumentsOnBuild=true`.
  - Output lands under `obj/` (git-ignored) — the regen script copies it into the
    frontend tree, so the API project never writes into `Tidansu.App`.
  - No EF migration: this changes no entity/`DbContext` model, only build config.

### Build — the `npm run build:api` chain (`src/Tidansu.App`)

- [x] add `cross-env` as a `devDependency` in `src/Tidansu.App/package.json`
  - Needed so the regen step can set `ASPNETCORE_ENVIRONMENT=Development` identically
    on Windows (PowerShell) and POSIX shells. See the ⚠️ on the next task.

- [x] rewrite the `build:api-file` script in `src/Tidansu.App/package.json` to
  generate the doc at build time and place it at `./src/api/api.json`, replacing the
  broken `swagger tofile …` invocation. Keep `build:api-fix`, `build:api-client`,
  `build:api-patch` **exactly as-is** (they are the working steps).
  🔒 blocked by: the two csproj tasks above
  - Shape (adjust the copy to the real emitted filename — see Open Question 2):
    ```json
    "build:api": "npm run build:api-file && npm run build:api-fix && npm run build:api-client && npm run build:api-patch",
    "build:api-file": "cross-env ASPNETCORE_ENVIRONMENT=Development dotnet build ../Tidansu.API/Tidansu.API.csproj -c Debug -p:OpenApiGenerateDocumentsOnBuild=true && node ./src/api/copy-openapi.mjs",
    ```
  - ⚠️ **Environment must be Development.** The getdocument tool builds the host, which
    runs `AddPresentation`'s registration guards. Those throw on a missing JWT
    secret / FrontendUrl when `!IsDevelopment()`. `cross-env ASPNETCORE_ENVIRONMENT=Development`
    keeps them inert and needs no secrets. Confirm the tool honours it on first run
    (Open Question 1); the explicit set makes it work regardless of the tool's default.
  - ⚠️ The `dotnet build` here **produces the DLL and the doc in one step**, so the
    old "requires a fresh `dotnet build` of the API first" caveat disappears — this
    step *is* that build. Do not document a separate pre-build.

- [x] create `src/Tidansu.App/src/api/copy-openapi.mjs` — a tiny cross-platform copy
  that moves the single emitted doc from `../Tidansu.API/obj/openapi/` to
  `./src/api/api.json` (mirror the existing `fix-openapi.mjs` file style: `fs`
  read/write, no deps)
  🔒 blocked by: the `build:api-file` rewrite
  - ⚠️ Copy the actual produced file — some `ApiDescription.Server` versions name it
    `api.json`, others suffix the document name (`api_v1.json`). Glob `obj/openapi/*.json`
    and fail loudly if zero or more-than-one match, rather than hard-coding a name
    (Open Question 2). This keeps the step honest if the naming convention differs.

### Toolchain reproducibility (kills the "version-pinning tribal knowledge", FR-1/FR-4)

- [x] create `.config/dotnet-tools.json` (repo root) as a local tool manifest pinning
  the `Microsoft.OpenApi.Kiota` (`kiota`) CLI to the exact version the client is
  generated with, and **omit** `Swashbuckle.AspNetCore.Cli` entirely
  - `dotnet tool restore` then gives every clone the exact kiota version — no global
    install, no version guessing. The Swashbuckle CLI global tool is no longer needed
    by anything after this change.
  - Optional but strongly recommended: it directly satisfies FR-1's "only the
    documented toolchain installed" and FR-4's "no tribal knowledge". If deferred,
    the CLAUDE.md doc task **must** instead list `kiota` as an explicit prerequisite
    with its version.

### Documentation

- [x] update the `build:api` line and add a short "regenerating the API client"
  note in `CLAUDE.md` (Commands → Frontend section, lines ~24) so it matches reality
  (FR-4): one command from `src/Tidansu.App`, `dotnet tool restore` (or the kiota
  version) as the only prerequisite, no running app, no `curl`, no manual steps.
  🔒 blocked by: the script + toolchain tasks
  - Remove any implication that a separate `dotnet build` must be run first.

- [x] retire the `kiota-regen-tooling` memory note (FR-6) — **done by the
  orchestrator** (rewritten to describe the working one-command flow; MEMORY.md
  index line already accurate). Exactly what changed:
  - Delete / mark obsolete the "`swagger tofile` always fails" + running-app-`curl`
    fallback block (lines ~20–44) — that workaround is superseded by B-21.
  - Delete the "must install `Swashbuckle.AspNetCore.Cli` matching the API version"
    guidance — the CLI is no longer used.
  - Replace with one line: "`npm run build:api` regenerates the client end-to-end via
    build-time OpenAPI generation (`Microsoft.Extensions.ApiDescription.Server`);
    prerequisite is `dotnet tool restore` for the pinned `kiota` CLI. No running app,
    no `curl`."
  - The user-scope note also lives at
    `C:\Users\eksil\.claude\projects\C--Users-eksil-RiderProjects-tidansu\memory\kiota-regen-tooling.md`
    and is indexed in that project's `MEMORY.md` — both should be updated/retired.

### Verification (no automated E2E suite exists — these are explicit)

- [x] `dotnet build` (normal, from `src/Tidansu.API`) succeeds and does **not** emit
  or modify `api.json` — proves FR-5 (normal build untouched, `OnBuild=false` holds)
- [x] from a clean working tree, run `npm run build:api` once in `src/Tidansu.App`;
  then `git diff --stat src/Tidansu.App/src/api/apiClient src/Tidansu.App/src/api/api.json`
  → **empty**. This is the FR-3 contract-fidelity + FR-1 one-command gate.
  🔒 blocked by: all build/script tasks
  - ⚠️ If the diff is non-empty, inspect it before "fixing" anything: a change in
    `paths`/`components/schemas` is a real red flag (the doc shape moved — surface it,
    do not paper over). A change confined to `info`/ordering is a normalization
    question — check whether `fix-openapi.mjs` (which re-serializes via
    `JSON.stringify`) already absorbs it.
- [x] run `npm run build:api` a **second** time back-to-back → `git diff` still empty
  (FR-2 idempotence — the real correctness bar, not just "it ran")
- [x] `npm run build` (vue-tsc + vite) succeeds — proves the regenerated client still
  type-checks and FR-5 holds for the frontend pipeline
- [x] manual clean-clone-style drive of the documented command: follow the updated
  `CLAUDE.md` literally (`dotnet tool restore`, then `npm run build:api`) in a fresh
  checkout / cleared `obj` + uninstalled global Swashbuckle CLI, and confirm it
  produces a populated client with **no** other command in between (FR-1/FR-4)

### Refactoring

- [x] [refactor] none required in touched files. `Program.cs` and
  `WebApplicationBuilderExtensions.cs` are **not** modified by the chosen approach
  (that is a benefit of Option 2 over Option 3). The `package.json` chain stays a
  clean four-step pipeline. No Clean-Architecture / SOLID / template-purity surface
  is touched. — "No refactoring needed in touched files."

---

## 2. 🔒 Security Considerations

- **getdocument builds the service provider (runs registration code).** 🟢 Low.
  It executes DI registration (up to `builder.Build()`) but **not** middleware,
  `app.Run()`, or the DB migration block. No inbound socket is opened, no SQL
  connection is made, no secret is required (Development keeps the fail-loud guards
  inert).
  - [ ] Confirm generation runs as `Development` so no real JWT/SMTP/Stripe secret is
    ever needed or read during a client regen (`cross-env` already sets this).
- **No new runtime attack surface.** 🟢 Low. `Microsoft.Extensions.ApiDescription.Server`
  is `PrivateAssets="all"` (build-only) and ships nothing to the deployed app.
  - [ ] Verify the package does not appear in the published output / `bin` runtime
    closure after a `dotnet publish`.

## 3. 📈 Scalability / Correctness Considerations

- **Idempotence is the true bar (FR-2), not "it runs".** A non-deterministic doc
  would leave every future backend PR with unreviewable client churn.
  - [ ] The two verification runs above must both yield an empty diff. Swashbuckle's
    generator is deterministic for a fixed contract; if ordering flutter appears,
    normalize in `fix-openapi.mjs` (it already re-serializes) rather than accepting
    churn.
- **Normal-build cost (FR-5).** `OpenApiGenerateDocumentsOnBuild=false` means the
  generation target is inert on ordinary `dotnet build` / `npm run build`.
  - [ ] Confirm no measurable build-time change on a plain `dotnet build` after adding
    the package + properties.
- **Contract drift going forward (out of scope, noted).** Nothing here fails a PR
  when a dev forgets to regen after a controller change — that is the deferred CI
  drift-check (already backlogged as the B-21 follow-up; see Open Question 3).

## 4. 📦 New Dependencies

- **`Microsoft.Extensions.ApiDescription.Server`** `10.0.x` (latest, e.g. `10.0.9`).
  Justification: build-time OpenAPI emission for the Kiota regen without a running
  host. Target: `src/Tidansu.API/Tidansu.API.csproj`, `PrivateAssets="all"`. Config:
  the four MSBuild properties above.
- **`cross-env`** (latest, `^7.x` / `^10.x`). Justification: cross-platform env-var
  set (`ASPNETCORE_ENVIRONMENT=Development`) in the npm regen step. Target:
  `src/Tidansu.App/package.json` `devDependencies`. No config.
- **`.config/dotnet-tools.json`** (not a package — a local tool manifest) pinning the
  existing `kiota` CLI; removes the ad-hoc global-install requirement. Optional but
  recommended (see toolchain task).
- The previously-required **`Swashbuckle.AspNetCore.Cli`** global tool is **removed**
  from the workflow (net reduction).

## 5. ❓ Open Questions

1. **getdocument's default environment.** The plan sets
   `ASPNETCORE_ENVIRONMENT=Development` explicitly via `cross-env`, so the
   `AddPresentation` guards stay inert regardless. Confirm on the first real run that
   the tool honours it (if it silently forces Production, the guards throw and we'd
   need `-p:` env forwarding or a launchSettings profile). Low risk — `dotnet ef`
   resolves this same host today — but it's the one thing unverifiable without running.
2. **Emitted filename.** Confirm whether `--file-name api` yields `api.json` or a
   document-name-suffixed `api_v1.json` in `obj/openapi/`. The `copy-openapi.mjs`
   step globs `*.json` and fails on ambiguity, so it is robust either way — but the
   exact name should be pinned in the doc once observed.
3. **CI drift-check follow-up.** The requirements suggest filing a separate item for a
   CI check that fails a PR when the committed client drifts from a fresh regen. It is
   already captured in `docs/backlog.md` as the B-21 follow-up (depends on this
   landing). Confirm the human wants it filed as its own tracked item now — it is
   explicitly **out of scope** for B-21.
4. **Keep kiota global or move to the local manifest?** The manifest task is the
   cleaner, tribal-knowledge-killing choice; if the human prefers to keep kiota as a
   documented global tool instead, the CLAUDE.md doc task must list its exact version
   as a prerequisite instead.
