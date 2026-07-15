---
name: dependency-bump-b11
description: LIGHT-path scoping pattern for pure dependency/advisory-bump maintenance items (B-11); confirmed direct-vs-transitive status of the three NU1903 packages
metadata:
  type: project
---

B-11 (bump `AutoMapper`, `System.Security.Cryptography.Xml`, `Microsoft.OpenApi`
past their `NU1903` advisories) is a third LIGHT-path shape, alongside the
endpoint-guard/event-handler pattern in [[webhook-hardening-b9]] and the
audit-type pattern in [[security-scalability-audit-b8]]: a **pure
dependency/version-bump maintenance item** with zero product-facing behaviour
change intended. It gets a short requirements note (a couple of FRs — "bump
cleanly" + "prove no regression" — plus a reference lookup of which packages
are direct vs transitive) rather than the full multi-phase FR template. No
plan/limit, spatial-model, or paywall dimension applies at all to this shape.

**Why:** explicit orchestrator instruction scoping B-11 down (2026-07-14),
consistent with how B-8/B-9/B-10 were already scoped down from the default
heavy template.

**How to apply:** when a backlog item is framed as "bump/patch a vulnerable or
outdated dependency," default to: (1) confirm direct vs transitive via the
`.csproj` files (or `dotnet list package --include-transitive`) so the
tech-lead doesn't have to re-derive it, (2) call out any known version-pairing
constraint between packages (here: Swashbuckle ↔ Microsoft.OpenApi, which the
Kiota regen toolchain depends on — see user memory `kiota-regen-tooling`), (3)
make the acceptance criteria the verification gates (clean build, app runs,
frontend build, codegen/regen still works, no output-shape regression), and
(4) surface breaking-change tolerance as an explicit open question for the
product owner rather than assuming "take the latest."

**Confirmed for B-11 (2026-07-14):** `AutoMapper` is a **direct** reference
(via `AutoMapper.Extensions.Microsoft.DependencyInjection` in
`Tidansu.Application.csproj`). `Microsoft.OpenApi` and
`System.Security.Cryptography.Xml` are both **transitive** — no direct
`PackageReference` anywhere in the solution — pulled in via
`Swashbuckle.AspNetCore` and (most likely) the ASP.NET Core
Identity/JwtBearer stack respectively.
