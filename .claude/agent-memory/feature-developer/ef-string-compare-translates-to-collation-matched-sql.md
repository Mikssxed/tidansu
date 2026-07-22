---
name: ef-string-compare-translates-to-collation-matched-sql
description: EF Core translates C# string.Compare(a, b) < 0 into a plain SQL `<` comparison under the column's own collation — verified via query log for a rank/COUNT(*) query
metadata:
  type: project
---

For B-24 (server-side over-cap gate matching the SPA's `OrderBy(s => s.Id)`
badge rule), `dbContext.Spaces.Where(s => s.UserId == userId && string.Compare(s.Id, spaceId) < 0).CountAsync(ct)`
translates to exactly `SELECT COUNT(*) FROM [Spaces] AS [s] WHERE [s].[UserId] = @userId AND [s].[Id] < @spaceId`
— confirmed by reading the EF query log with `dotnet run` in Development (sensitive
data logging is on by default there). No graph load, and the `<` runs under the
`Id` column's own SQL Server collation, so it stays consistent with `OrderBy(Id)`
elsewhere in the same repository.

**Why this mattered:** the tech-task explicitly warned that an in-memory ordinal
C# comparison (`string.CompareOrdinal`) could silently pick a different over-cap
set than the SPA's badge rule, because .NET ordinal ordering and SQL Server's
default collation can diverge on certain characters. `string.Compare(a, b) < 0`
written directly in the LINQ `Where`, left untouched by EF's translator, is what
keeps the comparison inside SQL instead of pulling ids into memory first.

**How to apply:** whenever a query needs to mirror a `OrderBy(EntityIdColumn)`
elsewhere in the same table, prefer `string.Compare(a, b)` operators inside the
LINQ predicate over hand-rolled in-memory comparisons — and confirm the
translation by reading the actual generated SQL from the dev log rather than
assuming it composes.
