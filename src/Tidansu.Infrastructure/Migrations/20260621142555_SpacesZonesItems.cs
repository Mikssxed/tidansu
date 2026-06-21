using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tidansu.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SpacesZonesItems : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Spaces",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Type = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    ViewMode = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    CanvasMode = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    LayoutColumns = table.Column<int>(type: "int", nullable: false),
                    ColumnLabels = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Spaces", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Spaces_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Item",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    SpaceId = table.Column<string>(type: "nvarchar(64)", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ZoneId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    Tags = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DateAdded = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Expiry = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    Photo = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    SlotIndex = table.Column<int>(type: "int", nullable: true),
                    Depth = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Level = table.Column<int>(type: "int", nullable: false),
                    Icon = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Item", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Item_Spaces_SpaceId",
                        column: x => x.SpaceId,
                        principalTable: "Spaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Zone",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    SpaceId = table.Column<string>(type: "nvarchar(64)", nullable: false),
                    Position = table.Column<int>(type: "int", nullable: false),
                    Label = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    Color = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    GridCols = table.Column<int>(type: "int", nullable: false),
                    GridRows = table.Column<int>(type: "int", nullable: false),
                    HasDepth = table.Column<bool>(type: "bit", nullable: false),
                    Floor = table.Column<bool>(type: "bit", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Facing = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Levels = table.Column<int>(type: "int", nullable: false),
                    Column = table.Column<int>(type: "int", nullable: false),
                    RectX = table.Column<double>(type: "float", nullable: true),
                    RectY = table.Column<double>(type: "float", nullable: true),
                    RectW = table.Column<double>(type: "float", nullable: true),
                    RectH = table.Column<double>(type: "float", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Zone", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Zone_Spaces_SpaceId",
                        column: x => x.SpaceId,
                        principalTable: "Spaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Item_SpaceId",
                table: "Item",
                column: "SpaceId");

            migrationBuilder.CreateIndex(
                name: "IX_Spaces_UserId",
                table: "Spaces",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Zone_SpaceId",
                table: "Zone",
                column: "SpaceId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Item");

            migrationBuilder.DropTable(
                name: "Zone");

            migrationBuilder.DropTable(
                name: "Spaces");
        }
    }
}
