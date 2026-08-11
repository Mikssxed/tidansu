using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tidansu.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTermsAcceptance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AcceptedTermsVersion",
                table: "MagicLinkTokens",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "TermsAcceptances",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    TermsVersion = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    AcceptedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TermsAcceptances", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TermsAcceptances_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TermsAcceptances_UserId_TermsVersion",
                table: "TermsAcceptances",
                columns: new[] { "UserId", "TermsVersion" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TermsAcceptances");

            migrationBuilder.DropColumn(
                name: "AcceptedTermsVersion",
                table: "MagicLinkTokens");
        }
    }
}
