---
name: sqlcmd-quoted-identifier-inline-query
description: sqlcmd -Q inline queries against this project's DB need an explicit SET QUOTED_IDENTIFIER ON, or bracketed/reserved-keyword columns (e.g. AspNetUsers.Plan) fail with Msg 1934
metadata:
  type: project
---

Running an ad-hoc `sqlcmd -S "(localdb)\MSSQLLocalDB" -d TidansuDb -Q "..."` (or `-i script.sql`)
against this schema throws `Msg 1934 ... SET options are correct for use with indexed views
and/or indexes on computed columns...` on plain `INSERT`/`UPDATE` statements that reference a
bracketed identifier — hit this on `AspNetUsers.[Plan]` (a reserved word requiring brackets).
sqlcmd's default session doesn't set `QUOTED_IDENTIFIER ON`, and this schema apparently has
something (a computed column or similar) that requires it.

**Why:** wasted a retry cycle assuming the SQL itself was wrong (missing bracket, bad table name)
when the real cause was the session option.

**How to apply:** prefix every sqlcmd `-Q`/`-i` script touching this DB with `SET NOCOUNT ON; SET
QUOTED_IDENTIFIER ON;` as the first line, before the real statements. Cheap and always safe to
include even when not strictly needed.
