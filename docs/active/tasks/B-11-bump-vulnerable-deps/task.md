---
id: B-11
slug: bump-vulnerable-deps
title: Bump dependencies flagged by NU1903 advisories
status: done   # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: []
touch-points:
  - src/**/*.csproj
  - src/Tidansu.App (npm run build:api / Kiota regen re-verify)
---

# B-11 · Bump dependencies flagged by NU1903 advisories

## Description
The build surfaces `NU1903` known-vulnerability advisories on three packages —
`AutoMapper 12.0.1`, `System.Security.Cryptography.Xml 9.0.0`, and
`Microsoft.OpenApi 2.4.1`. None are B-6-specific; they pre-date it. Bump each to a
patched version so the build is free of known-vulnerability advisories, without
breaking the app or the codegen toolchain.

## Acceptance criteria
- [x] `dotnet build` no longer emits `NU1903` for the three flagged packages.
- [x] Backend builds clean; app runs.
- [x] `npm run build` (frontend type-check + build) passes.
- [x] `npm run build:api` (Kiota regen from swagger) still works — the
      Swashbuckle/Microsoft.OpenApi version-match constraint is respected.
- [x] No behavioural regression in AutoMapper mappings or OpenAPI/swagger output.

### Resolution note (2026-07-14)
AutoMapper was **suppressed** (`NuGetAuditSuppress` for GHSA-rvv3-g6hj-g44x), not
bumped — per product decision on Open Q1, deferring the AutoMapper 15 licensing
call. Microsoft.OpenApi (via Swashbuckle 10.2.3) and System.Security.Cryptography.Xml
(explicit 9.0.15 pin) were bumped as planned. See `tech-tasks.md` for the full
verification trail.

## Notes
- **Version-match constraint:** the Kiota regen tooling depends on a matched
  Swashbuckle ↔ Microsoft.OpenApi pairing (see memory `kiota-regen-tooling`).
  Bumping `Microsoft.OpenApi` in isolation may break `swagger tofile` / the regen.
  Tech-lead must confirm the compatible target versions before bumping.
- **Transitive vs direct (confirmed from `.csproj` files):**
  - `AutoMapper` — **direct**, via `AutoMapper.Extensions.Microsoft.DependencyInjection
    12.0.1` in `Tidansu.Application.csproj`. Bump directly.
  - `Microsoft.OpenApi` — **transitive**, via `Swashbuckle.AspNetCore 10.1.2` in
    `Tidansu.API.csproj`. No direct reference; needs a pin or a compatible
    Swashbuckle bump.
  - `System.Security.Cryptography.Xml` — **transitive**, no direct reference found;
    likely pulled in via the ASP.NET Core Identity/JwtBearer stack
    (`Microsoft.AspNetCore.Identity.EntityFrameworkCore` /
    `Microsoft.AspNetCore.Authentication.JwtBearer`, both 10.0.0). Confirm actual
    parent via `dotnet list package --include-transitive` before pinning.
- Open questions for product owner (breaking-change tolerance for AutoMapper /
  Swashbuckle major bumps, and urgency/priority) are in `requirements.md`.

### Tech-planning notes (tech-lead, 2026-07-14)
Full plan in [`./tech-tasks.md`](./tech-tasks.md). Confirmed patched targets and
parents from `obj/project.assets.json` + the GitHub advisories:
- **Microsoft.OpenApi** → bump `Swashbuckle.AspNetCore 10.1.2 → 10.2.3` (brings
  OpenApi 2.7.5). Minor bump, clean. **Must upgrade the global
  `Swashbuckle.AspNetCore.Cli` to 10.2.3 in lock-step** or Kiota regen breaks.
- **System.Security.Cryptography.Xml** → the PM's Identity/JWT guess was wrong;
  real parent is the **EF Core design-time tooling** (`EFCore.Tools → EFCore.Design
  → Microsoft.Build.Tasks.Core`). Fix = explicit `9.0.15` pin in
  **Infrastructure.csproj** (warning only surfaces there).
- **🔴 AutoMapper is the blocker.** Clearing the advisory forces `>= 15.1.1`, which
  **requires a commercial license** (Lucky Penny) + a config license key, and the
  DI-extensions package is discontinued (registration signature changes). This
  exceeds the "accept a breaking bump" gate — needs a product/licensing decision
  (see Open Q1). The other two bumps are independent and can ship first. Interim
  fallback = `NuGetAuditSuppress` the AutoMapper advisory.
- No EF migration (no entity changes). Kiota regen here is a *re-verify* step —
  the swagger shape must stay unchanged; a non-cosmetic `apiClient/` diff is a stop.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
