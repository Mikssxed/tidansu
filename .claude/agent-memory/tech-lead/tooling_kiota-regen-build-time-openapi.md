---
name: tooling-kiota-regen-build-time-openapi
description: How the Kiota client is regenerated (build:api) and why build-time OpenAPI beats the Swashbuckle CLI / running-app fetch here
metadata:
  type: project
---

The Kiota regen (`npm run build:api` in `src/Tidansu.App`) produces `api.json` then
runs `fix-openapi.mjs` → `kiota generate` → `fix-generated.mjs`. Only the
swagger-production step was ever broken.

**Decision (B-21, recommended at tech-planning — verify landed before asserting):**
produce `api.json` via **build-time OpenAPI generation** using
`Microsoft.Extensions.ApiDescription.Server` (build-only, `PrivateAssets="all"`,
MSBuild props with `OpenApiGenerateDocumentsOnBuild=false` so normal `dotnet build`
is untouched; the regen opts in with `-p:OpenApiGenerateDocumentsOnBuild=true`).

**Why:** the getdocument tool resolves the app through `HostFactoryResolver` — the
**same mechanism `dotnet ef` uses**, which already works against this
minimal-hosting `Program.cs`. The Swashbuckle *CLI* (`swagger tofile`) fails with
"A type named 'Startup' could not be found" because it falls back to a legacy
Startup-reflection path; version-matching never fixes that (proven in B-11/B-13).

**How to apply / gotchas for any future OpenAPI-tooling change:**
- Keep Swashbuckle's `IDocumentProvider` the *only* one — do **not** call
  `AddOpenApi()` (built-in provider) alongside it, or a second differently-shaped doc
  appears and the generated client drifts. The committed `api.json` is a pure
  Swashbuckle doc (no `servers` block; base URL is set client-side in
  `useApiClient.ts` via `adapter.baseUrl = window.location.origin`).
- Generation must run as `ASPNETCORE_ENVIRONMENT=Development` (via `cross-env`) — the
  `AddPresentation` fail-loud secret guards (JWT/FrontendUrl) throw when
  `!IsDevelopment()`. getdocument stops at `builder.Build()`, so the DB-migrate block
  and middleware never run; no DB/secret needed in Development.
- The contract-fidelity gate is: regen → `git diff` on `src/api/apiClient` +
  `api.json` is empty, twice (idempotence). A `paths`/`schemas` diff is a red flag;
  an `info`/ordering diff is a `fix-openapi.mjs` normalization question.
- This retires the old running-app-`curl` fallback and the `Swashbuckle.AspNetCore.Cli`
  global tool (see the retired `kiota-regen-tooling` user note).
