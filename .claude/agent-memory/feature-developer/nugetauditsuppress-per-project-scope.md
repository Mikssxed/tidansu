---
name: nugetauditsuppress-per-project-scope
description: NuGetAuditSuppress in one .csproj does not silence NU1903 for other projects that pull the same package in transitively via ProjectReference
metadata:
  type: project
---

`<NuGetAuditSuppress>` only silences the NU1903 warning in the `.csproj` it's
declared in. NuGet audit runs per-project against that project's *own* restored
graph — if project B references project A (via `ProjectReference`) and A has a
direct vulnerable package, B's own restore still re-flags the same advisory
independently. Suppressing it only in A leaves the warning present in every B/C
that references A.

**How to apply:** when suppressing an advisory that comes from a shared/lower
layer (e.g. `Tidansu.Application`), replicate the identical
`<NuGetAuditSuppress Include="https://github.com/advisories/...">` item (with
matching comment) into every consuming project whose build actually shows the
warning — confirmed here for `Tidansu.API.csproj` and `Tidansu.Infrastructure.csproj`
picking up `Tidansu.Application`'s AutoMapper advisory (B-11). There's no
`Directory.Build.props` in this repo yet; if a repo-wide suppression is ever
needed again, a root `Directory.Build.props` item would be the DRY fix instead of
duplicating per project.

Verify with a forced fresh restore (`dotnet restore --force`) and grep the whole
solution's `dotnet build` output for the advisory ID/GHSA — don't trust a single
project's clean build as proof the whole solution is clear.
