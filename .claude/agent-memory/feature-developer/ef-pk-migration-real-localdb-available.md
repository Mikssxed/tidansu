---
name: ef-pk-migration-real-localdb-available
description: dotnet ef database update can be rehearsed against a real populated LocalDB instance in this dev environment; a PK-only key-shape change leaves FKs on the same column untouched
metadata:
  type: project
---

This Windows dev environment has a working `(localdb)\MSSQLLocalDB` instance reachable via
`sqllocaldb info` / `sqlcmd -S "(localdb)\MSSQLLocalDB" -d <db>`, and it already holds real
seeded data (not empty) from prior manual runs of the API. `dotnet ef database update` can be
rehearsed directly against it — no need to spin up a throwaway container — and `sqlcmd` is enough
to diff row counts / inspect `sys.indexes` / `sys.index_columns` before and after.

Also confirmed empirically (B-22): when a migration changes only the `PRIMARY KEY` shape of a
table (`HasKey(x => new { A, B })` where the column set is otherwise unchanged), EF does **not**
emit `DropForeignKey`/`AddForeignKey` for FKs whose source column already existed and is
unchanged — it only touched `DropPrimaryKey`/`DropIndex`/`AddPrimaryKey`. The "if EF re-adds the
FK, check `onDelete: Cascade` survived" contingency some plans call out doesn't fire in that case;
confirm from the generated migration file whether `ForeignKey`/`DropForeignKey` even appears
before worrying about a downgraded cascade.

**Why:** saves re-deriving "can I actually rehearse this locally" and avoids over-auditing a
migration for FK regressions that structurally can't occur when the column itself never changes.

**How to apply:** for any future EF migration task in Tidansu, try `sqllocaldb info` /
`dotnet ef database update` against the real LocalDB first before reaching for a synthetic-only
rehearsal; and when hand-auditing a generated migration, check whether FK statements appear at
all before checking their `onDelete` value.

**Addendum (B-22 verification dispatch, when the migration is already applied to the main dev
DB):** if a prior dispatch already ran `dotnet ef database update` against the real `TidansuDb`
before your verification session starts, you can't get a true "before" snapshot there anymore.
Spin up a throwaway sibling LocalDB database instead: `sqlcmd -Q "CREATE DATABASE
TidansuDb_Foo"`, then override the connection string via the `ConnectionStrings__TidansuDb` env
var (both for `dotnet ef database update <PriorMigrationName>` to land it on the pre-migration
schema, and again for the plain `dotnet ef database update` to apply the migration under test) —
no `appsettings.json` edits needed. Seed synthetic rows with a small Python-generated `.sql`
script + `sqlcmd -i`, snapshot with `CHECKSUM_AGG`/`HASHBYTES('SHA2_256', ...)`, migrate, re-run
the same snapshot query, and diff the two text captures. Drop the throwaway database(s)
afterward. This is also the only way to rehearse the *failure* path safely (deliberately break a
DDL step, e.g. by manually dropping an index the migration expects to drop, and confirm the
transaction rolls back) — never do that against real data.
