---
name: read-path-projection-fixes
description: Planning shape for read-path perf fixes (B-14 SC-1 and siblings like B-16) — aggregate in memory not SQL to dodge the Max-over-empty trap, and prove it with the dev-only EF SQL log
metadata:
  type: project
---

For "stop loading the graph to compute N numbers" fixes, plan the repository
method to **project to scalars and aggregate in memory**, not to aggregate in SQL:
`Where(userId).Select(s => s.Items.Count).ToListAsync()` then Count/Sum/Max over
the materialized `List<int>`.

**Why:** SQL `MAX(...)` over zero rows returns `NULL`, so EF's `MaxAsync<int>`
throws on the empty case unless projected to `int?` and coalesced — and the empty
case is every new signup's first page load, i.e. the most-hit path, not an exotic
edge. Aggregating client-side means zero rows is an *empty list, not a NULL*:
`Sum()` → 0 safely, and only `Max()` throws, guarded by a `Count == 0 ? 0 :`
ternary. It also keeps derivation rules out of Infrastructure (the layer table
forbids business logic there) and avoids EF's fussier `GroupBy` translations.
The per-space-int row count is negligible next to the graph being removed.

**How to apply:** whenever a task says "count/aggregate without loading the
graph". Also: **the acceptance evidence is the SQL log, not the numbers** —
correct output proves nothing, since the slow path produced correct output too.
Have the developer read Serilog's `Executed DbCommand` and confirm no
`Items.Photo` / `Zones` / split-query trio. This only works in the Development
environment: `appsettings.Development.json` overrides
`Microsoft.EntityFrameworkCore` to `Information`, while B-7 left the base
`appsettings.json` at `Warning`.

Related: [[arch_domain-tests-are-the-only-test-surface]] — Application-layer
derivation rules like `UsageDto.From` have no unit-test home (the test project
references Domain only), so these fixes close on manual drives; don't invent a
Domain type just to make the math testable on a LIGHT path.
