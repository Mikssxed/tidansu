---
id: B-21
slug: fix-build-api-swagger
title: Fix `npm run build:api` — `swagger tofile` can't find a `Startup`
status: done   # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: []
touch-points:
  - src/Tidansu.App/package.json          # the build:api* script chain
  - src/Tidansu.API/Tidansu.API.csproj    # possible build-time OpenAPI doc generation
  - src/Tidansu.API/Program.cs            # minimal hosting; possible Startup shim / OpenAPI wiring
  - CLAUDE.md                             # the documented command
  - .claude/projects/.../memory/kiota-regen-tooling.md  # the workaround note to update/retire
---

# B-21 · Fix `npm run build:api` — `swagger tofile` can't find a `Startup`

## Description
The documented way to regenerate the frontend's API client — `npm run build:api`
in `src/Tidansu.App` — has never worked end-to-end. Its first step,
`build:api-file` (`swagger tofile … Tidansu.API.dll v1`), fails with *"A type named
'Startup' could not be found"*, so every task needing a Kiota regen (B-6, B-9,
B-11, B-13) has hand-run a workaround: boot the API with an empty connection
string and `curl` `/swagger/v1/swagger.json` out of the running app, then run the
remaining steps by hand. That's slow, error-prone, and makes the documented
command a trap for anyone new. The goal: make one documented command regenerate a
correct client on a clean clone, with no manual steps and no version-pinning
tribal knowledge.

## Acceptance criteria
- [ ] A clean clone runs `npm run build:api` and produces a correct Kiota client
      with **no manual steps** (no running-app fetch, no hand-run swagger steps).
- [ ] Re-running the command against an unchanged backend produces an **empty
      diff** against the committed client.
- [ ] `CLAUDE.md`'s documented command matches what actually works.
- [ ] No regression to `npm run build` (type-check + build) or `dotnet build`.

## Notes
**Root cause is diagnosed, not guessed** (per backlog): this is *not* the
Swashbuckle/OpenApi version-match issue from B-11 (that was bumped to 10.2.3 and
the error persisted). `grep -rn "class Startup" src/` returns nothing — the API
uses minimal hosting (top-level `Program.cs`), and the Swashbuckle CLI's
`swagger tofile` builds the host by reflection expecting the legacy
`Startup`/`CreateHostBuilder` shape. Version-matching can never fix that.

**Options for the tech-lead to weigh** (from the backlog item):
1. Promote the running-app `/swagger/v1/swagger.json` fetch to be the real
   `build:api-file` step — proven, it's what everyone already does.
2. Switch to build-time OpenAPI document generation
   (`Microsoft.Extensions.ApiDescription.Server`, or .NET's built-in OpenAPI doc
   generation) — both support minimal hosting.
3. Add a `Startup` shim purely to satisfy the CLI — least attractive (ceremony for
   a tool's benefit).

**Related memory:** `kiota-regen-tooling.md` documents the current manual
workaround — update or retire it once this lands.

**Path call (initial):** light-to-medium tooling/config change. No schema
migration, no auth/billing/plan-limit logic, no new API contract (the generated
client must stay byte-identical). Revisit weight after `tech-tasks.md` exists.

**Requirements confirmed (see `requirements.md`):** pure developer-tooling item,
no user-facing or plan dimension. Six FRs: one-command zero-manual-step regen,
idempotence (empty diff on re-run against unchanged backend), contract fidelity
(no incidental API surface change), `CLAUDE.md` accuracy, no regression to
`npm run build`/`dotnet build`, and retiring the `kiota-regen-tooling` workaround
note once the real fix lands. No open product questions — the only deferred
decision is the tech-lead's choice among the three candidate solutions. One
process suggestion: consider filing a separate follow-up item for a CI check
that fails a PR when the committed client drifts from a fresh regen (not
required for this item to be done).

## Tech-planning decision (see `tech-tasks.md`)
**Chosen: Option 2 — build-time OpenAPI generation** via
`Microsoft.Extensions.ApiDescription.Server` (build-only, `PrivateAssets="all"`),
driven by MSBuild and **off by default on normal builds**
(`OpenApiGenerateDocumentsOnBuild=false`); the regen script opts in with
`-p:OpenApiGenerateDocumentsOnBuild=true`. It emits **Swashbuckle's own document**
(today's source of truth → FR-3 byte-identical) with no running host, no DB, no
`curl`. Decisive evidence: `dotnet ef` already resolves this exact minimal-hosting
`Program.cs` via `HostFactoryResolver`, and getdocument uses the same resolver — so
host resolution is proven (the Swashbuckle *CLI* fails on a different, legacy
Startup-reflection path). The committed `api.json` is a pure Swashbuckle doc (no
`servers`/request-context fields), so a hostless run cannot diverge.

Key decisions/watch-outs the developer must know:
- Do **not** add `AddOpenApi()` / the built-in OpenAPI provider — keep Swashbuckle's
  `IDocumentProvider` the only one, or FR-3 breaks.
- Generation **must** run as `ASPNETCORE_ENVIRONMENT=Development` (via `cross-env`) so
  the `AddPresentation` fail-loud secret guards stay inert — no secrets needed.
- `Program.cs` and `WebApplicationBuilderExtensions.cs` are **not** modified (benefit
  over the Option 3 `Startup` shim). No EF migration (build config only).
- FR-6: retire the `kiota-regen-tooling` note (tech-lead flagged the exact edits;
  orchestrator applies them). The `Swashbuckle.AspNetCore.Cli` global tool is dropped.

Open questions for the human gate: (1) confirm getdocument honours the Development env
on first run; (2) exact emitted filename (`api.json` vs `api_v1.json`) — copy step
globs so it is robust; (3) file the CI drift-check as its own follow-up? (4) pin kiota
via `.config/dotnet-tools.json` vs. document it as a global prerequisite.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
