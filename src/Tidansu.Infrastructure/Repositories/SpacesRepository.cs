using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Tidansu.Domain.Entities;
using Tidansu.Domain.Repositories;
using Tidansu.Infrastructure.Persistence;

namespace Tidansu.Infrastructure.Repositories;

public class SpacesRepository(TidansuDbContext dbContext, ILogger<SpacesRepository> logger) : ISpacesRepository
{
    public Task<List<Space>> GetAllByUserAsync(string userId, CancellationToken cancellationToken = default)
        => dbContext.Spaces
            .Where(s => s.UserId == userId)
            .Include(s => s.Zones)
            .Include(s => s.Items)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

    public Task<Space?> GetByIdAsync(string id, string userId, CancellationToken cancellationToken = default)
        => dbContext.Spaces
            .Where(s => s.Id == id && s.UserId == userId)
            .Include(s => s.Zones)
            .Include(s => s.Items)
            .AsSplitQuery()
            .FirstOrDefaultAsync(cancellationToken);

    public Task<int> CountByUserAsync(string userId, CancellationToken cancellationToken = default)
        => dbContext.Spaces.CountAsync(s => s.UserId == userId, cancellationToken);

    // The account page only needs three integers (spaces/items/fullest-space); the full
    // graph (GetAllByUserAsync) carries every zone and item, including each item's
    // nvarchar(max) photo data-URL — megabytes for a Pro user with photo items, just to
    // count. This projects straight to a per-space COUNT(*) so no zone/item/photo column
    // ever leaves SQL. Do not "simplify" this back into GetAllByUserAsync + count (B-8 SC-1).
    public Task<List<int>> GetItemCountsPerSpaceAsync(string userId, CancellationToken cancellationToken = default)
        => dbContext.Spaces
            .Where(s => s.UserId == userId)
            .Select(s => s.Items.Count)
            .ToListAsync(cancellationToken);

    public async Task AddAsync(Space space, CancellationToken cancellationToken = default)
    {
        dbContext.Spaces.Add(space);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    // Closes the read-then-insert race on the Free space cap: two concurrent creates for
    // the same user could both read a count under the cap and both insert. A per-user,
    // transaction-owned exclusive sp_getapplock serializes same-user creates only — it is
    // a single resource per transaction so it cannot deadlock, and it never touches other
    // users' rows or Pro (unlimited) creates, which skip this method entirely. The
    // context is registered without EnableRetryOnFailure (see ServiceCollectionExtensions),
    // so this manual BeginTransactionAsync is safe as-is; if retry-on-failure is ever
    // enabled, this must move inside dbContext.Database.CreateExecutionStrategy().ExecuteAsync(...).
    public async Task<bool> AddWithinSpaceCapAsync(Space space, int spaceCap, CancellationToken cancellationToken = default)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);

        // Fixed-width, per-user resource key: sp_getapplock's @Resource is nvarchar(255),
        // and Identity ids can grow up to 450 chars, so hash rather than concatenate the raw
        // id (defense-in-depth — GUID ids fit comfortably today, but a future longer id
        // scheme must not truncate two different users onto the same lock resource).
        var resource = $"tidansu:space-create:{HashUserIdForLock(space.UserId)}";

        // sp_getapplock reports outcome via its stored-procedure RETURN code, not by
        // throwing: 0/1 = granted, negative = not granted (-1 timeout, -2 cancelled,
        // -3 deadlock victim, -999 other error). It must be captured explicitly — a
        // discarded return value silently falls through to the count+insert WITHOUT the
        // lock held, reopening the exact race this method exists to close.
        // Materialize via ToListAsync (not SingleAsync/FirstAsync): those compose an extra
        // TOP(N) wrapper around the SQL, which EF rejects as "non-composable" for a
        // multi-statement DECLARE/EXEC/SELECT batch. ToListAsync executes the batch as-is.
        var lockResults = await dbContext.Database
            .SqlQuery<int>(
                $@"DECLARE @res int;
EXEC @res = sp_getapplock @Resource={resource}, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout={5000};
SELECT @res AS Value;")
            .ToListAsync(cancellationToken);
        var lockResult = lockResults.Single();

        if (lockResult < 0)
        {
            // Fail closed: a non-granted lock is a transient infrastructure condition, not
            // an at-cap decision, so it must never be reported to the caller as a plan-limit
            // rejection (that would wrongly tell a paying-eligible user they're capped).
            // Roll back and surface a genuine error (500 via ErrorHandlingMiddleware).
            logger.LogError(
                "Space-create lock not acquired for user {UserId}: sp_getapplock returned {LockResult}",
                space.UserId, lockResult);
            await transaction.RollbackAsync(cancellationToken);
            throw new InvalidOperationException(
                $"Could not acquire space-create lock for user {space.UserId} (sp_getapplock={lockResult}).");
        }

        var currentCount = await dbContext.Spaces.CountAsync(s => s.UserId == space.UserId, cancellationToken);
        if (currentCount >= spaceCap)
        {
            await transaction.RollbackAsync(cancellationToken);
            return false;
        }

        dbContext.Spaces.Add(space);
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    // SHA-256 hex digest: fixed 64-char width regardless of input length, so the
    // "tidansu:space-create:" + hash resource key can never approach sp_getapplock's
    // 255-char @Resource bound, and distinct user ids cannot collide onto the same lock.
    private static string HashUserIdForLock(string userId)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(userId)));

    public void Remove(Space space) => dbContext.Spaces.Remove(space);

    public async Task ReplaceAsync(Space existing, List<Zone> zones, List<Item> items, CancellationToken cancellationToken = default)
    {
        // Delete the old children first so reused ids don't collide with the new set.
        dbContext.Set<Zone>().RemoveRange(existing.Zones);
        dbContext.Set<Item>().RemoveRange(existing.Items);
        await dbContext.SaveChangesAsync(cancellationToken);

        foreach (var zone in zones) zone.SpaceId = existing.Id;
        foreach (var item in items) item.SpaceId = existing.Id;
        existing.Zones = zones;
        existing.Items = items;
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default)
        => dbContext.SaveChangesAsync(cancellationToken);
}
