---
name: collation-vs-ordinal-uniqueness-checks
description: An in-memory Distinct()/HashSet duplicate check in front of a SQL unique constraint is case-sensitive while the DB is CI_AS — the 500 it was written to prevent survives. Check every new uniqueness validator.
metadata:
  type: feedback
---

When a diff adds an **application-layer uniqueness check whose stated purpose is to turn a
DB constraint violation into a clean 400**, check whether the two comparisons actually agree.

**Why:** `Distinct()` / `HashSet<string>` / `==` in .NET are **ordinal**. TidansuDb is
`SQL_Latin1_General_CP1_CI_AS` — case-**insensitive**, and SQL Server additionally ignores
trailing whitespace in `nvarchar` equality. EF's in-memory change tracker also compares keys
ordinally, so it doesn't catch the gap either. Net effect: `["z1","Z1"]` and `["z1","z1 "]`
pass validation, pass `ToEntity`'s graph build, and die at `SaveChangesAsync` as the exact
500 the rule existed to prevent. Found in B-22 (`SpaceDtoValidator.HasNoDuplicateIds`, added
alongside the `(SpaceId, Id)` composite key).

**How to apply:**
- Verify the collation, don't assume it — `SELECT DATABASEPROPERTYEX('TidansuDb','Collation')`
  and `sys.columns.collation_name` for the specific columns. No `UseCollation`/`HasCollation`
  call exists in `TidansuDbContext`, so it's the server default.
- Checks evaluated **in SQL** are safe and often sit right next to the broken one — in B-22
  `ZoneExistsInSpaceAsync`/`ItemExistsInSpaceAsync` (handler pre-checks) were correct because
  `AnyAsync(z => z.Id == id)` translates to SQL. Only the in-memory `CreateSpace` graph path
  was exposed. Say which path is affected; the asymmetry is the whole finding.
- Severity Major, not Critical: hand-crafted request, no data loss, no tenancy break.
- Fix: `StringComparer.OrdinalIgnoreCase` over `TrimEnd()`-normalised values, or constrain the
  id charset so ordinal ≡ collation by construction.

Rule appended to `.claude/context/backend-rules.md` § Validation.

Related: [[fluentvalidation-must-nre-on-json-null]], [[verify-claims-vs-test-count]]
