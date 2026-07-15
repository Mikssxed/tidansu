# B-11 · Technical Tasks — Bump dependencies flagged by NU1903

> Scope: `.csproj` version changes + one AutoMapper registration edit + toolchain
> re-verify. **No entity/DbContext changes → no EF migration.** Kiota regen is a
> *re-verification* step here (prove the swagger shape is unchanged), not a
> consumer-facing client change.

## Investigation results (done by tech-lead — do not re-litigate)

Confirmed by reading the restored graphs
(`src/*/obj/project.assets.json`, `dotnet list package` equivalent) and the
GitHub advisories. Exact resolved parents and patched targets:

| Package (flagged) | Kind | Parent (confirmed) | Advisory | Affected | **Minimal patched target** |
|---|---|---|---|---|---|
| `AutoMapper 12.0.1` | direct | `AutoMapper.Extensions.Microsoft.DependencyInjection 12.0.1` (`Tidansu.Application.csproj`) | GHSA-rvv3-g6hj-g44x (DoS, CVSS 7.5) | `< 15.1.1` | **15.1.1** — breaking major + **license** ⚠️ |
| `Microsoft.OpenApi 2.4.1` | transitive | `Swashbuckle.AspNetCore 10.1.2` (`Tidansu.API.csproj`) → OpenApi `2.4.1` | GHSA-v5pm-xwqc-g5wc / CVE-2026-49451 (DoS, 7.5) | `>= 2.0.0-preview.11, <= 2.7.4` | **2.7.5** — reached by bumping Swashbuckle to **10.2.3** |
| `System.Security.Cryptography.Xml 9.0.0` | transitive | **`Microsoft.EntityFrameworkCore.Design` → `Microsoft.Build.Tasks.Core 17.14.28`** (via the design-time `Microsoft.EntityFrameworkCore.Tools 10.0.0` in `Tidansu.Infrastructure.csproj`) | GHSA-37gx-xxp4-5rgx + GHSA-w3x6-4m5h-cxqf (DoS, 7.5) | `9.x <= 9.0.14` | **9.0.15** (explicit pin) |

**Correction to the brief:** `System.Security.Cryptography.Xml` is **not** pulled
in via the Identity/JwtBearer stack (the PM's guess). Its sole resolved parent is
the **EF Core design-time tooling** (`EFCore.Tools → EFCore.Design →
Microsoft.Build.Tasks.Core 17.14.28`). It only surfaces in the **Infrastructure**
project's audit, not the API project's — so the pin belongs in
`Tidansu.Infrastructure.csproj`.

**Kiota / Swashbuckle version-match (the critical one):** per the
`kiota-regen-tooling` memory, `swagger tofile` + the Kiota chain need a global
`Swashbuckle.AspNetCore.Cli` whose version **matches the API's Swashbuckle**.
Bumping Swashbuckle `10.1.2 → 10.2.3` (which brings `Microsoft.OpenApi 2.7.5` and
clears the advisory) is the clean fix, but it **requires upgrading the global CLI
tool to 10.2.3 in lock-step** — otherwise regen throws
`Could not load file or assembly 'Microsoft.OpenApi'`. We deliberately bump
Swashbuckle rather than pin `Microsoft.OpenApi` under an unchanged 10.1.2, because
a pin re-introduces exactly the assembly-version skew that memory warns about.

---

## 📋 Technical Tasks

### Backend — API (Swashbuckle → Microsoft.OpenApi 2.7.5)

*Lowest-risk, self-contained — do this one first so the Kiota toolchain is proven
before the riskier AutoMapper change.*

- [x] modify `Swashbuckle.AspNetCore` version `10.1.2` → `10.2.3` in `src/Tidansu.API/Tidansu.API.csproj`
      (10.2.3 depends on `Microsoft.OpenApi >= 2.7.5`, so the transitive `2.4.1` is lifted to a patched `2.7.5` — clears GHSA-v5pm-xwqc-g5wc with no explicit pin).
- [x] verify `Microsoft.AspNetCore.OpenApi 10.0.0` (also in `Tidansu.API.csproj`, declares `Microsoft.OpenApi >= 2.0.0`) still restores cleanly against the unified `2.7.5` — expected fine via roll-forward; confirm at `dotnet restore`/build.

### Backend — Infrastructure (System.Security.Cryptography.Xml pin)

- [x] add an explicit `<PackageReference Include="System.Security.Cryptography.Xml" Version="9.0.15" />` to `src/Tidansu.Infrastructure/Tidansu.Infrastructure.csproj`
      (overrides the transitive `9.0.0` from the EF design-time tooling; `9.0.15` is the smallest patched on the resolved `9.0.x` line — clears GHSA-37gx-xxp4-5rgx + GHSA-w3x6-4m5h-cxqf. Alternative `10.0.6` = net10-aligned; see Open Q2.)

### Backend — Application (AutoMapper 15.1.1) — 🔒 blocked by: Open Question #1 (licensing decision)

**SKIPPED — Open Question #1 resolved to "suppress" (interim, pending an
AutoMapper-licensing/ownership call).** The four tasks below were not started;
the suppression task in Refactoring was done instead.

*Do not start these until the AutoMapper-licensing decision is made. If the answer
is "suppress for now", skip this whole group and do the suppression task in
Refactoring instead — the other two advisories are already cleared above.*

- [ ] modify `Tidansu.Application.csproj`: **remove** `AutoMapper.Extensions.Microsoft.DependencyInjection 12.0.1` and **add** `<PackageReference Include="AutoMapper" Version="15.1.1" />`
      (the DI-extensions package was discontinued in AutoMapper 13 — `AddAutoMapper` now lives in the core package. `15.1.1` is the minimal version that clears GHSA-rvv3-g6hj-g44x.)
      🔒 blocked by: Open Question #1
- [ ] modify the `AddAutoMapper(applicationAssembly)` call at `src/Tidansu.Application/Extensions/ServiceCollectionExtensions.cs:20` to the v15 signature — configuration-action first, assembly second, license key from config:
      `services.AddAutoMapper(cfg => { cfg.LicenseKey = configuration["AutoMapper:LicenseKey"]; }, applicationAssembly);`
      (v15 removed `AddAutoMapper(params Assembly[])`; all overloads now take an `Action<IMapperConfigurationExpression>` first. `configuration` is already a parameter of `AddApplication`.)
      🔒 blocked by: prior task
- [ ] add an `AutoMapper:LicenseKey` prod-only fail-loud startup guard in `src/Tidansu.API/Extensions/WebApplicationBuilderExtensions.cs`, modelled on the existing `JwtSettings:Secret` guard — gate on `IsProduction()` so Development / the Kiota-regen running-app fallback still boots without the key, throw `InvalidOperationException` naming the key, never echo the value (per the config fail-loud pattern).
      🔒 blocked by: prior task
- [ ] confirm AutoMapper 15 does not hard-fail at startup when the license key is **absent in Development** (it must only warn) — if it throws without a key, the Kiota-regen running-app fallback breaks; in that case a dummy/dev key must be wired into `appsettings.Development.json`. Verify empirically. (Non-obvious: this is the second way the AutoMapper bump can break the regen toolchain.)

### Toolchain re-verify (Kiota) — 🔒 blocked by: the Swashbuckle bump

- [x] `dotnet build src/Tidansu.API` (fresh build so the swagger DLL is current for the CLI).
- [x] upgrade the global Swashbuckle CLI to match the bumped package:
      `dotnet tool update -g Swashbuckle.AspNetCore.Cli --version 10.2.3`
      (must equal the `Swashbuckle.AspNetCore 10.2.3` in the csproj — mismatch → `Could not load file or assembly 'Microsoft.OpenApi'`. Ensure `~/.dotnet/tools` is on PATH.)
- [x] regenerate the client: `npm run build:api` from `src/Tidansu.App`
      (if `swagger tofile` fails with the `Startup`-type error, use the running-app fallback in the `kiota-regen-tooling` memory: boot the API with an empty `TidansuDb` connection string, `curl` `/swagger/v1/swagger.json`, then run `fix-openapi.mjs` → `kiota generate` → `fix-generated.mjs`).
      `swagger tofile` did throw the documented `Startup`-type error; used the running-app fallback with a real `TidansuDb` connection (API was already running for the boot check) instead of an empty one — same effect.
- [x] **review the git diff of `src/Tidansu.App/src/api/apiClient/`** — a *good* outcome is an empty or cosmetic-only diff (whitespace/comments). **Bad** outcome = any added/removed/renamed operation or changed request/response type: that means the OpenApi 2.7.5 emitter changed the swagger shape and this stops being a maintenance task (would force a client-contract commit). If bad, halt and raise before merging.
      Outcome: good. Only diff is 413/429 error mappings on `webhook/index.ts`, traced to a pre-existing uncommitted `BillingController.cs` change (`[ProducesResponseType]` attributes from the unrelated B-9 task) — not caused by the OpenApi 2.7.5 bump. No operation/type added, removed, or renamed.

### Frontend — build re-verify — 🔒 blocked by: Kiota regen

- [x] `npm run build` from `src/Tidansu.App` (vue-tsc type-check + build) — must pass against the regenerated client.

### Refactoring

No refactoring needed in touched files — the only code edit is the AutoMapper
registration line, and it already lands in the composition root (correct seam).

*Conditional fallback task (only if Open Question #1 resolves to "suppress"):*
- [x] add a scoped `NuGetAuditSuppress` for GHSA-rvv3-g6hj-g44x (AutoMapper) in `Tidansu.Application.csproj` with a comment linking this task and Open Q1, instead of the AutoMapper bump — keeps the build advisory-free without taking the license obligation. Revisit when a licensing decision lands.
      Note: the suppression had to be duplicated (with the same comment) into `Tidansu.API.csproj` and `Tidansu.Infrastructure.csproj` too — NuGetAudit re-flags AutoMapper's advisory in every project whose restore graph transitively includes it (both reference `Tidansu.Application` via `ProjectReference`), so a single suppression in `Tidansu.Application.csproj` alone left the warning present in the other two.

---

## 🔒 Security Considerations

- **All three advisories are the same class — unauthenticated DoS (uncontrolled
  recursion / infinite loop, each CVSS 7.5).** Fixing them is the point of the task.
  - [x] Confirm zero `NU1903` after the bumps (verification below). 🟠 High
- **`AutoMapper:LicenseKey` is a bearer secret.** If the AutoMapper bump proceeds,
  the key must never reach logs and must be prod-guarded like `JwtSettings:Secret`
  (per the config fail-loud pattern).
  - [ ] N/A — AutoMapper bump did not proceed (Open Q1 resolved to suppress instead); no license key introduced.
- **Microsoft.OpenApi DoS is only reachable via swagger-document parsing**, which is
  dev-gated in `Program.cs` (`app.UseSwagger()` sits inside `IsDevelopment()`), so
  prod exposure is low — but the bump is still correct.
  - [x] Confirm no code path change re-exposes `UseSwagger` in Production after the Swashbuckle bump. 🟢 Low — verified `Program.cs` untouched, `UseSwagger()`/`UseSwaggerUI()` still gated by `IsDevelopment()`.

## 📈 Scalability / Correctness Considerations

- **Swagger-shape drift → silent frontend break.** The one real blast radius. A
  changed OpenApi emitter (2.4.1 → 2.7.5) could alter operation/schema output and
  silently drift the Kiota client.
  - [x] Diff-review `apiClient/` after regen; treat any non-cosmetic change as a blocker (task above). 🟠 High
- **AutoMapper 15's new default recursion-depth limit** (the very fix in the
  advisory) could truncate deeply-nested mappings. Tidansu's mapped graph
  (space → zones → items) is shallow (≤3 levels), so it should be unaffected — but
  verify, don't assume.
  - [x] Manually confirm a full space graph (zones + items) maps end-to-end with unchanged shape/values after the bump. 🟡 Medium — AutoMapper wasn't bumped (suppressed instead), so this is really "confirm the build/regen didn't disturb the existing mapping": drove `GET /api/spaces/{id}` against real dev data (space with 5 zones + 10 items) post-build/regen; full nested shape and values rendered correctly.
- No EF queries, no DbContext, no unbounded reads, no plan-limit path touched by
  this task — nothing to consider there.

## 📦 New Dependencies

- **`Swashbuckle.AspNetCore` 10.1.2 → 10.2.3** — `Tidansu.API.csproj`. Brings
  `Microsoft.OpenApi 2.7.5`; clears the OpenApi advisory. Requires matching global
  `Swashbuckle.AspNetCore.Cli 10.2.3` for Kiota regen.
- **`System.Security.Cryptography.Xml` 9.0.15** (new explicit pin) —
  `Tidansu.Infrastructure.csproj`. Overrides the transitive `9.0.0` from EF
  design-time tooling.
- **`AutoMapper` 15.1.1** (replaces `AutoMapper.Extensions.Microsoft.DependencyInjection 12.0.1`)
  — `Tidansu.Application.csproj`. **Conditional on Open Q1.** Introduces a
  **commercial license obligation** (Lucky Penny Software) and an
  `AutoMapper:LicenseKey` config value.
- **Global dev tool:** `Swashbuckle.AspNetCore.Cli 10.2.3` (not a project reference;
  developer-machine / CI toolchain only).

## ❓ Open Questions

1. **🔴 AutoMapper 15 licensing — blocking.** Clearing GHSA-rvv3-g6hj-g44x forces
   AutoMapper `>= 15.1.1`, and AutoMapper 15 **requires a commercial license**
   (free below a revenue threshold, but still requires accepting Lucky Penny's
   terms, generating a license key, and storing it as a prod secret). The Stage-1
   gate authorized *a breaking major bump* but **not** a new licensing/legal
   obligation — that is a separate product/ownership call. Options:
   (a) obtain + configure a license key (likely free-tier for an indie app) and do
   the AutoMapper task group; (b) **suppress** the AutoMapper advisory via
   `NuGetAuditSuppress` as an interim (the other two advisories still clear) and
   revisit; (c) migrate off AutoMapper entirely (much larger scope, out of this
   task's spirit). **Recommend (a) if free-tier applies; (b) as the safe interim.**
   The other two bumps are independent and should ship regardless of this answer.
2. **🟢 `System.Security.Cryptography.Xml` pin: `9.0.15` vs `10.0.6`.** `9.0.15` is
   the literal-minimal patch on the resolved `9.0.x` line (default in the plan);
   `10.0.6` aligns with the net10 runtime line. Both clear the advisory — confirm
   the default is acceptable or switch to `10.0.6`.
3. **🟢 Coexistence check:** confirm at build that `Microsoft.AspNetCore.OpenApi
   10.0.0` and `Swashbuckle.AspNetCore 10.2.3` both resolve happily against the
   unified `Microsoft.OpenApi 2.7.5` (expected via roll-forward; flagged only
   because it's the one untested pairing).

---

## ✅ Verification (close-out — no automated test suite)

Run after the chosen tasks land:

- [x] `dotnet build` from repo root — green, and **grep the output for `NU1903`: zero
      occurrences** for AutoMapper (if bumped/suppressed), Microsoft.OpenApi, and
      System.Security.Cryptography.Xml.
- [x] `dotnet run --project src/Tidansu.API` — API boots with no new startup errors
      (watch for AutoMapper license warnings/throws and the config guard firing). N/A on the license-warning part — AutoMapper was suppressed, not bumped.
- [x] Kiota regen (`npm run build:api`) succeeds; `apiClient/` diff is empty/cosmetic.
- [x] `npm run build` (vue-tsc) — green.
- [x] **Manual e2e drive** (`/verify` or `/run`): log in, open a space that has
      zones + items, confirm the list renders with the same data shape/values as
      before (exercises the AutoMapper mapping path and the regenerated client).
      No plan-cap or downgrade path applies to this task — nothing to drive there.
      Done via a direct authenticated API drive (magic-link → JWT → `GET /api/spaces/{id}`)
      against real dev data rather than a full browser UI session — proportionate for a
      dependency-bump/toolchain task where the risk is "did the build/regen disturb the
      mapping", not new UI logic. Response showed the full nested space → zones (5) →
      items (10) shape with all fields intact.
