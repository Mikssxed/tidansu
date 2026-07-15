---
name: nugetauditsuppress-per-project
description: Why NuGetAuditSuppress entries are duplicated across csproj files — don't false-flag as a DRY violation
metadata:
  type: feedback
---

`NuGetAuditSuppress` for a transitive advisory must be repeated in **every**
project whose restore graph includes the flagged package, not just the project
that owns the direct reference. NuGetAudit runs per-project, so a suppression in
`Tidansu.Application.csproj` alone leaves the same NU1903 present in
`Tidansu.API` and `Tidansu.Infrastructure` (both reference Application via
`ProjectReference`).

**Why:** confirmed on the B-11 review — the AutoMapper GHSA-rvv3-g6hj-g44x
suppression was correctly duplicated across all three csproj files for this exact
reason.

**How to apply:** don't flag such duplication as a DRY violation. The real
(minor) risk is *removal drift* — deleting the suppression later means editing
every copy. The clean fix is a root `Directory.Build.props` with one
`<NuGetAuditSuppress>` (the repo currently has none). Suppressions should be
**advisory-ID-scoped** (specific GHSA URL), never blanket, or they hide future
advisories — verify that first. Related: [[workflow-uncommitted-multitask-worktree]].
