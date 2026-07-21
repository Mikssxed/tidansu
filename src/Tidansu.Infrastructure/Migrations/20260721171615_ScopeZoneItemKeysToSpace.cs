using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tidansu.Infrastructure.Migrations
{
    /// <summary>
    /// Rescopes Zone/Item primary keys from (Id) to (SpaceId, Id) — B-22.
    ///
    /// This is a key-definition migration, not a data migration: no column is added, dropped,
    /// retyped or rewritten, and zero row values are read or written. It cannot fail on any
    /// existing dataset — (Id) was already unique table-wide (it was the sole PK column), so
    /// (SpaceId, Id) is unique *a fortiori*. ADD PRIMARY KEY therefore cannot hit a duplicate-key
    /// error regardless of how much data exists. DROP/ADD PRIMARY KEY are ordinary transactional
    /// DDL on SQL Server, so EF's default per-migration transaction already gives an all-or-
    /// nothing / fail-loud rollback for free — do not add suppressTransaction: true, which is the
    /// one thing that would undo that guarantee.
    ///
    /// SpaceId leads (not Id): every read path in SpacesRepository filters by space first, and a
    /// SpaceId-leading clustered key co-locates one space's rows on the same pages. That is also
    /// why EF drops IX_Zone_SpaceId / IX_Item_SpaceId below — a non-clustered index whose sole
    /// column is now the PK's leading column is pure write amplification with no read benefit.
    ///
    /// FK_Zone_Spaces_SpaceId / FK_Item_Spaces_SpaceId (both onto Spaces.Id, ON DELETE CASCADE)
    /// are untouched by this migration — the SpaceId column itself doesn't change, so EF has no
    /// reason to drop/re-add them, and the cascade delete behaviour is preserved as-is.
    ///
    /// The Down() below is what EF generated; per the settled fail-loud posture it is not a
    /// supported recovery path — restore-from-backup is. Left in place rather than deleted only
    /// because EF's tooling expects a Down() to exist.
    /// </summary>
    public partial class ScopeZoneItemKeysToSpace : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_Zone",
                table: "Zone");

            migrationBuilder.DropIndex(
                name: "IX_Zone_SpaceId",
                table: "Zone");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Item",
                table: "Item");

            migrationBuilder.DropIndex(
                name: "IX_Item_SpaceId",
                table: "Item");

            migrationBuilder.AddPrimaryKey(
                name: "PK_Zone",
                table: "Zone",
                columns: new[] { "SpaceId", "Id" });

            migrationBuilder.AddPrimaryKey(
                name: "PK_Item",
                table: "Item",
                columns: new[] { "SpaceId", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "PK_Zone",
                table: "Zone");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Item",
                table: "Item");

            migrationBuilder.AddPrimaryKey(
                name: "PK_Zone",
                table: "Zone",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_Item",
                table: "Item",
                column: "Id");

            migrationBuilder.CreateIndex(
                name: "IX_Zone_SpaceId",
                table: "Zone",
                column: "SpaceId");

            migrationBuilder.CreateIndex(
                name: "IX_Item_SpaceId",
                table: "Item",
                column: "SpaceId");
        }
    }
}
