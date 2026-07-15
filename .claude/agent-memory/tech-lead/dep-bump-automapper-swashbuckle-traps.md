---
name: dep-bump-automapper-swashbuckle-traps
description: Two non-obvious traps when bumping Tidansu's flagged deps — AutoMapper 15 licensing/DI-merge, and the Swashbuckle↔OpenApi↔Kiota-CLI lockstep
metadata:
  type: project
---

Two dependency-bump traps discovered while planning B-11 (NU1903 remediation).

**AutoMapper: clearing its advisory forces a licensed major.**
The DoS advisory GHSA-rvv3-g6hj-g44x affects **all** AutoMapper `< 15.1.1` (incl.
our 12.0.1) — there is no unlicensed escape version. AutoMapper **15 requires a
commercial license** (Lucky Penny Software; free below a revenue threshold but
still needs an accepted license + a key stored as a prod secret), and since v13
the `AutoMapper.Extensions.Microsoft.DependencyInjection` package is discontinued
(merged into core). So the bump changes the `AddAutoMapper` registration signature
(`Action<IMapperConfigurationExpression>` first, assembly second, `cfg.LicenseKey`)
**and** adds a licensing obligation.
- **Why it matters:** this is bigger than a "breaking bump" a tech gate can wave
  through — it's a legal/ownership + secret-management decision. Also the missing
  key can hard-fail startup, which would break the Kiota-regen running-app fallback
  (Development boots with blank config).
- **How to apply:** treat an AutoMapper major bump as product-gated, not routine.
  Interim advisory-clear = `NuGetAuditSuppress` the GHSA in the csproj. Key must be
  prod-guarded like `JwtSettings:Secret` (see [[arch-config-fail-loud-and-secret-logging]])
  and tolerated-absent in Development.

**Swashbuckle ↔ Microsoft.OpenApi ↔ Kiota-CLI move in lockstep.**
The `Microsoft.OpenApi` advisory (CVE-2026-49451, patched 2.7.5) is transitive via
Swashbuckle. Fix = bump `Swashbuckle.AspNetCore 10.1.2 → 10.2.3` (which pins
OpenApi >= 2.7.5) rather than pin OpenApi under an unchanged Swashbuckle — a bare
pin re-creates the assembly-version skew the `kiota-regen-tooling` memory warns
about. **The global `Swashbuckle.AspNetCore.Cli` tool must be bumped to the exact
same version (10.2.3)** or `npm run build:api` throws
`Could not load file or assembly 'Microsoft.OpenApi'`.
- **How to apply:** any Swashbuckle version change is a 3-way move (package + global
  CLI + re-verify the `apiClient/` diff is cosmetic-only). A non-cosmetic swagger
  diff turns a maintenance bump into a client-contract change.
