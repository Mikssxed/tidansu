using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Tidansu.Domain.Entities;

namespace Tidansu.Infrastructure.Persistence;

public class TidansuDbContext(DbContextOptions<TidansuDbContext> options) : IdentityDbContext<User>(options)
{
    public DbSet<RefreshToken> RefreshTokens { get; set; }
    public DbSet<MagicLinkToken> MagicLinkTokens { get; set; }
    public DbSet<Space> Spaces { get; set; }
    public DbSet<ProcessedStripeEvent> ProcessedStripeEvents { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<RefreshToken>(token =>
        {
            token.Property(t => t.TokenHash).HasMaxLength(64);
            token.HasIndex(t => t.TokenHash).IsUnique();

            token.HasOne(t => t.User)
                .WithMany(u => u.RefreshTokens)
                .HasForeignKey(t => t.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<MagicLinkToken>(token =>
        {
            token.Property(t => t.Email).HasMaxLength(256);
            token.Property(t => t.TokenHash).HasMaxLength(64);
            token.HasIndex(t => t.TokenHash).IsUnique();
            token.HasIndex(t => t.Email);
        });

        modelBuilder.Entity<User>(user =>
        {
            user.Property(u => u.DisplayName).HasMaxLength(256);
            user.Property(u => u.Plan).HasConversion<string>().HasMaxLength(16);

            // Stripe ids — indexed for the webhook lookup path (resolve account by
            // subscription/customer id, never by email).
            user.Property(u => u.StripeCustomerId).HasMaxLength(255);
            user.Property(u => u.StripeSubscriptionId).HasMaxLength(255);
            user.HasIndex(u => u.StripeSubscriptionId);
            user.HasIndex(u => u.StripeCustomerId);
        });

        modelBuilder.Entity<ProcessedStripeEvent>(evt =>
        {
            evt.HasKey(e => e.Id);
            evt.Property(e => e.Id).HasMaxLength(255);
            evt.Property(e => e.Type).HasMaxLength(64);
        });

        // Space.Id stays the SOLE, globally-unique primary key (no HasKey call — EF
        // convention keys on Id alone), unlike Zone/Item below which take a composite
        // (SpaceId, Id) key. That is deliberate, not an oversight: Space is the FK
        // PRINCIPAL for Zone.SpaceId/Item.SpaceId (see HasMany(...).WithOne(...) below), and
        // a SQL Server FK must reference a primary key or unique constraint on the
        // principal column(s) — re-keying Space to (UserId, Id) would either keep a
        // separate UNIQUE index on Id (re-imposing the exact global uniqueness this
        // paragraph is about) or force adding+backfilling a UserId column on both Zone and
        // Item to rewire their FKs, an invasive data migration for no gain. See B-23
        // tech-tasks § 0 for the full elimination of that option.
        //
        // As of B-23, the VALUE in this column is server-assigned by ISpaceIdGenerator
        // (a CSPRNG) rather than client-supplied. That is what closes, at the tenancy
        // root, the same class of cross-tenant collision/DoS/existence-oracle that the
        // composite key on Zone/Item (below) closes one level down (B-22 § S-H1): before
        // B-23, a client could choose Space.Id, so it could squat another tenant's
        // low-entropy predicted id and force their space creation to a collision/500.
        // Do not read the B-22 comments on Zone/Item's composite key, or the D-3/D-4
        // ownership-scoping comments in SpacesRepository, as implying this was already
        // closed for Space — it was not, until this change.
        modelBuilder.Entity<Space>(space =>
        {
            space.Property(s => s.Id).HasMaxLength(64);
            space.Property(s => s.Name).HasMaxLength(120);
            space.Property(s => s.Type).HasMaxLength(16);
            space.Property(s => s.ViewMode).HasMaxLength(16);
            space.Property(s => s.CanvasMode).HasMaxLength(16);
            // string[]? → JSON column (EF primitive collection).
            space.PrimitiveCollection(s => s.ColumnLabels);

            space.HasOne(s => s.User)
                .WithMany()
                .HasForeignKey(s => s.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            space.HasIndex(s => s.UserId);

            space.HasMany(s => s.Zones)
                .WithOne()
                .HasForeignKey(z => z.SpaceId)
                .OnDelete(DeleteBehavior.Cascade);

            space.HasMany(s => s.Items)
                .WithOne()
                .HasForeignKey(i => i.SpaceId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Zone>(zone =>
        {
            // Composite key scopes zone ids to their owning space (B-22): before this, PK_Zone
            // was on Id alone, so ids were unique across every tenant's spaces — a client-
            // supplied, clock-derived id from one user could collide with another user's zone
            // and 500. SpaceId leads (not Id) because every read path filters by space first;
            // the clustered key co-locates one space's zones on the same pages.
            zone.HasKey(z => new { z.SpaceId, z.Id });

            zone.Property(z => z.Id).HasMaxLength(64);
            zone.Property(z => z.Label).HasMaxLength(120);
            zone.Property(z => z.Color).HasMaxLength(16);
            zone.Property(z => z.Kind).HasMaxLength(16);
            zone.Property(z => z.Facing).HasMaxLength(16);
        });

        modelBuilder.Entity<Item>(item =>
        {
            // Composite key scopes item ids to their owning space (B-22) — see the matching
            // comment on Entity<Zone> above. ZoneId is intentionally left out of the key: it is
            // a bare, unconstrained column (Item.cs) with no FK to Zone, and stays that way.
            item.HasKey(i => new { i.SpaceId, i.Id });

            item.Property(i => i.Id).HasMaxLength(64);
            item.Property(i => i.Name).HasMaxLength(200);
            item.Property(i => i.ZoneId).HasMaxLength(64);
            item.Property(i => i.DateAdded).HasMaxLength(40);
            item.Property(i => i.Expiry).HasMaxLength(40);
            item.Property(i => i.Depth).HasMaxLength(16);
            item.Property(i => i.Icon).HasMaxLength(40);
            item.PrimitiveCollection(i => i.Tags);
            // Photos may be data URLs — leave Photo as nvarchar(max) (default for string).
        });
    }
}
