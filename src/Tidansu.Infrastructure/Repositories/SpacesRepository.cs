using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Logging;
using Tidansu.Domain.Entities;
using Tidansu.Domain.Repositories;
using Tidansu.Infrastructure.Persistence;

namespace Tidansu.Infrastructure.Repositories;

public class SpacesRepository(TidansuDbContext dbContext, ILogger<SpacesRepository> logger) : ISpacesRepository
{
    public Task<Space?> GetByIdAsync(string id, string userId, CancellationToken cancellationToken = default)
        => dbContext.Spaces
            .Where(s => s.Id == id && s.UserId == userId)
            .Include(s => s.Zones)
            .Include(s => s.Items)
            .AsSplitQuery()
            .FirstOrDefaultAsync(cancellationToken);

    public Task<int> CountByUserAsync(string userId, CancellationToken cancellationToken = default)
        => dbContext.Spaces.CountAsync(s => s.UserId == userId, cancellationToken);

    // B-24: the target space's 0-based rank in the same OrderBy(Id) order
    // GetSpaceSummariesPageAsync pages by. string.Compare(s.Id, spaceId) < 0 (NOT
    // string.CompareOrdinal, and NOT an in-memory comparison) is deliberate: EF
    // translates it to a relational `WHERE Id < @spaceId` evaluated under the Id
    // column's own collation — the same collation SQL Server uses for
    // `OrderBy(s => s.Id)`. Comparing ids in memory with C# ordinal semantics can
    // silently pick a different over-cap set than the SPA badges (parity bug this
    // query exists to avoid). Owner-scoped (D-3): only ever counts among userId's
    // own spaces.
    public Task<int> CountSpacesOrderedBeforeAsync(string spaceId, string userId, CancellationToken cancellationToken = default)
        => dbContext.Spaces
            .Where(s => s.UserId == userId && string.Compare(s.Id, spaceId) < 0)
            .CountAsync(cancellationToken);

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

    // The list page (B-16 / SC-3) only needs card-summary columns + counts + up to 6
    // zone colours — the full graph (former GetAllByUserAsync) carried every zone and
    // item, including each item's nvarchar(max) photo data-URL, for the whole account
    // at once. This projects straight to SpaceSummary so no item/photo column ever
    // leaves SQL, and pages server-side rather than loading everything into memory
    // first. Do not "simplify" this back into a .Include(Zones).Include(Items) graph
    // plus in-memory Skip/Take/mapping (B-8 SC-1/SC-3). Ordered by the stable Id key
    // so paging is deterministic across requests.
    public Task<List<SpaceSummary>> GetSpaceSummariesPageAsync(string userId, int skip, int take, CancellationToken cancellationToken = default)
        => dbContext.Spaces
            .Where(s => s.UserId == userId)
            .OrderBy(s => s.Id)
            .Skip(skip)
            .Take(take)
            .Select(s => new SpaceSummary(
                s.Id,
                s.Name,
                s.Type,
                s.ViewMode,
                s.CanvasMode,
                s.LayoutColumns,
                s.ColumnLabels,
                s.Zones.Count,
                s.Items.Count,
                s.Zones.OrderBy(z => z.Position).Take(6).Select(z => z.Color).ToList()))
            .ToListAsync(cancellationToken);

    // The read-only, photo-less full graph for one space (B-16 / SC-3): projects into
    // entity instances that leave Item.Photo unset (null), so the nvarchar(max) column
    // is never referenced in the SELECT and never leaves SQL. AsNoTracking — this feeds
    // DTO mapping only, never a mutate path. Distinct from GetByIdAsync, which stays
    // tracked + photo-bearing for DeleteSpaceCommandHandler's cascade — do not merge them.
    public Task<Space?> GetLayoutByIdAsync(string id, string userId, CancellationToken cancellationToken = default)
        => dbContext.Spaces
            .Where(s => s.Id == id && s.UserId == userId)
            .Select(s => new Space
            {
                Id = s.Id,
                UserId = s.UserId,
                Name = s.Name,
                Type = s.Type,
                ViewMode = s.ViewMode,
                CanvasMode = s.CanvasMode,
                LayoutColumns = s.LayoutColumns,
                ColumnLabels = s.ColumnLabels,
                Zones = s.Zones.OrderBy(z => z.Position).Select(z => new Zone
                {
                    Id = z.Id,
                    SpaceId = z.SpaceId,
                    Position = z.Position,
                    Label = z.Label,
                    Color = z.Color,
                    GridCols = z.GridCols,
                    GridRows = z.GridRows,
                    HasDepth = z.HasDepth,
                    Floor = z.Floor,
                    Kind = z.Kind,
                    Facing = z.Facing,
                    Levels = z.Levels,
                    Column = z.Column,
                    RectX = z.RectX,
                    RectY = z.RectY,
                    RectW = z.RectW,
                    RectH = z.RectH,
                }).ToList(),
                // Photo is deliberately never referenced here (SC-3) — every other
                // field is projected, leaving Photo at its default (null).
                Items = s.Items.Select(i => new Item
                {
                    Id = i.Id,
                    SpaceId = i.SpaceId,
                    Name = i.Name,
                    ZoneId = i.ZoneId,
                    Quantity = i.Quantity,
                    Tags = i.Tags,
                    DateAdded = i.DateAdded,
                    Expiry = i.Expiry,
                    SlotIndex = i.SlotIndex,
                    Depth = i.Depth,
                    Level = i.Level,
                    Icon = i.Icon,
                }).ToList(),
            })
            .AsNoTracking()
            .FirstOrDefaultAsync(cancellationToken);

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
        var resource = $"tidansu:space-create:{HashForLock(space.UserId)}";
        await AcquireLockOrThrowAsync(transaction, resource, $"space-create for user {space.UserId}", cancellationToken);

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
    // "tidansu:space-create:"/"tidansu:space-content:" + hash resource key can never
    // approach sp_getapplock's 255-char @Resource bound, and distinct ids (user ids
    // here, space ids too as of B-15's per-space content lock below) cannot collide
    // onto the same lock resource. Renamed from HashUserIdForLock (B-15 T-29): it now
    // hashes space ids as well as user ids.
    private static string HashForLock(string id)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(id)));

    // The ONE place the per-space content lock resource is built (D-4). Zones and items
    // deliberately share a single resource per space: two resources would preserve B-12's
    // "one resource per transaction ⇒ cannot deadlock" property only by convention, and
    // convention is what a future edit breaks. Building the key here makes that property
    // structural — AddZoneWithinCapAsync and AddItemWithinCapAsync cannot drift apart
    // because there is no second copy of this string to edit.
    private static string SpaceContentLockResource(string spaceId)
        => $"tidansu:space-content:{HashForLock(spaceId)}";

    // The sp_getapplock preamble, in ONE place, shared by all three locked inserts.
    //
    // sp_getapplock reports outcome via its stored-procedure RETURN code, not by throwing:
    // 0/1 = granted, negative = not granted (-1 timeout, -2 cancelled, -3 deadlock victim,
    // -999 other error). It MUST be captured explicitly — a discarded return value silently
    // falls through to the caller's count+insert WITHOUT the lock held, reopening the exact
    // race the lock exists to close, and looking identical to success. That failure mode is
    // precisely why this lives in one method rather than being hand-copied per call site.
    //
    // Materialize via ToListAsync (not SingleAsync/FirstAsync): those compose an extra
    // TOP(N) wrapper around the SQL, which EF rejects as "non-composable" for a
    // multi-statement DECLARE/EXEC/SELECT batch. ToListAsync executes the batch as-is.
    //
    // The context is registered without EnableRetryOnFailure (see ServiceCollectionExtensions),
    // so the callers' manual BeginTransactionAsync is safe as-is; if retry-on-failure is ever
    // enabled, each caller must move inside dbContext.Database.CreateExecutionStrategy().ExecuteAsync(...).
    private async Task AcquireLockOrThrowAsync(
        IDbContextTransaction transaction, string resource, string context, CancellationToken cancellationToken)
    {
        var lockResults = await dbContext.Database
            .SqlQuery<int>(
                $@"DECLARE @res int;
EXEC @res = sp_getapplock @Resource={resource}, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout={5000};
SELECT @res AS Value;")
            .ToListAsync(cancellationToken);
        var lockResult = lockResults.Single();
        if (lockResult >= 0) return;

        // Fail closed: a non-granted lock is a transient infrastructure condition, not an
        // at-cap decision, so it must never be reported to the caller as a plan-limit
        // rejection (that would wrongly tell a paying-eligible user they're capped).
        // Roll back and surface a genuine error (500 via ErrorHandlingMiddleware).
        logger.LogError(
            "Lock not acquired for {LockContext}: sp_getapplock returned {LockResult}",
            context, lockResult);
        await transaction.RollbackAsync(cancellationToken);
        throw new InvalidOperationException(
            $"Could not acquire lock for {context} (sp_getapplock={lockResult}).");
    }

    public void Remove(Space space) => dbContext.Spaces.Remove(space);

    public Task SaveChangesAsync(CancellationToken cancellationToken = default)
        => dbContext.SaveChangesAsync(cancellationToken);

    // ---- Granular per-entity access (B-15) -----------------------------------
    //
    // D-3: every query below is rooted at dbContext.Spaces.Where(s => s.Id ==
    // spaceId && s.UserId == userId) — there is no overload that resolves a zone
    // or item by bare id, so an unscoped/cross-user mutation is not expressible
    // through this repository at all. Zone/Item have no Space navigation (see
    // TidansuDbContext), so they're reached via s.Zones/s.Items.
    //
    // B-22: since the Zone/Item primary key became (SpaceId, Id) (previously Id
    // alone), this owner-scoping is no longer just how these queries happen to be
    // written — it's load-bearing. Before, a bare Id was unique table-wide, so even
    // an under-scoped `WHERE Id = @id` could only ever hit one row; now the same Id
    // can legitimately exist in many spaces, so an under-scoped lookup could match
    // (or mutate/delete) rows across tenants. Every query below is confirmed
    // space/owner-rooted (see the B-22 audit note in git history); RemoveItemAsync
    // in particular now states `i.SpaceId == spaceId` directly rather than only via
    // the ownership EXISTS, for exactly this reason.
    //
    // B-22/B-23 scope note (security review § S-L2): the reasoning above is about
    // Zone/Item ONLY — it does not, and never did, cover Space itself. Space has no
    // parent id to scope against (it IS the tenancy root and the FK principal for
    // Zone/Item), so it could not take the same composite-key fix; until B-23, its
    // Id was client-supplied and globally unique, making it the one entity where an
    // under-scoped or colliding id was still exploitable (cross-tenant DoS +
    // existence oracle — B-22 § S-H1). B-23 closed that by server-assigning
    // Space.Id from a CSPRNG (ISpaceIdGenerator) rather than re-keying Space — see
    // CreateSpaceCommandHandler and the Entity&lt;Space&gt; comment in
    // TidansuDbContext. Do not read this block as "tenant isolation is structural
    // repo-wide"; it is structural for Zone/Item's composite key and, separately,
    // for Space's id-forgery angle via server assignment — two different
    // mechanisms for two different entity shapes.

    // FR-7 / B-14: renaming a space (or flipping its view/canvas mode) must not
    // pull every zone and item — including each item's nvarchar(max) photo
    // data-URL — into memory. Do not reuse GetByIdAsync here; it .Includes both.
    public Task<Space?> GetByIdWithoutContentAsync(string id, string userId, CancellationToken cancellationToken = default)
        => dbContext.Spaces
            .Where(s => s.Id == id && s.UserId == userId)
            .FirstOrDefaultAsync(cancellationToken);

    // Projects straight to a SQL COUNT(*) — no zone/item/photo column leaves the
    // database, same discipline as GetItemCountsPerSpaceAsync (B-8 SC-1). The
    // outer filter is what makes a null mean "not found or not owned" rather than
    // "empty space": an owned space with zero zones also projects to 0, never null.
    public Task<int?> CountZonesAsync(string spaceId, string userId, CancellationToken cancellationToken = default)
        => dbContext.Spaces
            .Where(s => s.Id == spaceId && s.UserId == userId)
            .Select(s => (int?)s.Zones.Count)
            .FirstOrDefaultAsync(cancellationToken);

    public Task<int?> CountItemsAsync(string spaceId, string userId, CancellationToken cancellationToken = default)
        => dbContext.Spaces
            .Where(s => s.Id == spaceId && s.UserId == userId)
            .Select(s => (int?)s.Items.Count)
            .FirstOrDefaultAsync(cancellationToken);

    // Deliberately tracked, NOT AsNoTracking(): the handler mutates the returned
    // entity's fields and calls SaveChangesAsync (see UpdateZoneCommandHandler /
    // UpdateItemCommandHandler). AsNoTracking() here would make every field
    // update a silent no-op — looks like an obvious read-path optimisation, is not.
    public Task<Zone?> GetZoneAsync(string spaceId, string zoneId, string userId, CancellationToken cancellationToken = default)
        => dbContext.Spaces
            .Where(s => s.Id == spaceId && s.UserId == userId)
            .SelectMany(s => s.Zones)
            .FirstOrDefaultAsync(z => z.Id == zoneId, cancellationToken);

    // Same "deliberately tracked" caveat as GetZoneAsync above.
    public Task<Item?> GetItemAsync(string spaceId, string itemId, string userId, CancellationToken cancellationToken = default)
        => dbContext.Spaces
            .Where(s => s.Id == spaceId && s.UserId == userId)
            .SelectMany(s => s.Items)
            .FirstOrDefaultAsync(i => i.Id == itemId, cancellationToken);

    public Task<bool> ZoneExistsInSpaceAsync(string spaceId, string zoneId, string userId, CancellationToken cancellationToken = default)
        => dbContext.Spaces
            .Where(s => s.Id == spaceId && s.UserId == userId)
            .SelectMany(s => s.Zones)
            .AnyAsync(z => z.Id == zoneId, cancellationToken);

    // Mirrors ZoneExistsInSpaceAsync verbatim, for items — same D-3 owner-scoped root,
    // no bare-id overload (F-6's in-space duplicate-id pre-check for AddItem).
    public Task<bool> ItemExistsInSpaceAsync(string spaceId, string itemId, string userId, CancellationToken cancellationToken = default)
        => dbContext.Spaces
            .Where(s => s.Id == spaceId && s.UserId == userId)
            .SelectMany(s => s.Items)
            .AnyAsync(i => i.Id == itemId, cancellationToken);

    // Closes the same read-then-insert race as AddWithinSpaceCapAsync, but keyed
    // per SPACE rather than per user (D-4): two concurrent zone-add requests
    // against the same space could both read a count under the cap and both
    // insert. A single sp_getapplock resource per space — shared with
    // AddItemWithinCapAsync below, NOT a separate resource per dimension — keeps
    // B-12's "one resource per transaction ⇒ cannot deadlock" argument structural
    // rather than an invariant a future edit could silently break. Free-only:
    // Pro's caps are unlimited, so PlanCaps.For(Pro).Zones is null and the
    // handler calls AddZoneAsync instead, taking no lock and never serializing.
    // The context is registered without EnableRetryOnFailure (see
    // ServiceCollectionExtensions), so this manual BeginTransactionAsync is safe
    // as-is; if retry-on-failure is ever enabled, this must move inside
    // dbContext.Database.CreateExecutionStrategy().ExecuteAsync(...).
    public async Task<ContentInsertOutcome> AddZoneWithinCapAsync(Zone zone, string userId, int zoneCap, CancellationToken cancellationToken = default)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);

        await AcquireLockOrThrowAsync(transaction, SpaceContentLockResource(zone.SpaceId),
            $"space-content for space {zone.SpaceId}", cancellationToken);

        // Authoritative in-lock re-count, owner-scoped: null means the space was
        // deleted concurrently (or was never owned by userId) between the
        // handler's pre-check and this call.
        var currentCount = await CountZonesAsync(zone.SpaceId, userId, cancellationToken);
        if (currentCount is null)
        {
            await transaction.RollbackAsync(cancellationToken);
            return ContentInsertOutcome.SpaceNotFound;
        }

        if (currentCount >= zoneCap)
        {
            await transaction.RollbackAsync(cancellationToken);
            return ContentInsertOutcome.AtCap;
        }

        dbContext.Set<Zone>().Add(zone);
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return ContentInsertOutcome.Inserted;
    }

    // Same contract and caveats as AddZoneWithinCapAsync above — shares the same
    // "tidansu:space-content:{spaceId}" lock resource (D-4: one resource per
    // space covering zones AND items, not two).
    public async Task<ContentInsertOutcome> AddItemWithinCapAsync(Item item, string userId, int itemCap, CancellationToken cancellationToken = default)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);

        // SpaceContentLockResource is what makes D-4 structural: this and
        // AddZoneWithinCapAsync cannot drift onto two different lock resources,
        // because there is only one copy of the key to edit.
        await AcquireLockOrThrowAsync(transaction, SpaceContentLockResource(item.SpaceId),
            $"space-content for space {item.SpaceId}", cancellationToken);

        var currentCount = await CountItemsAsync(item.SpaceId, userId, cancellationToken);
        if (currentCount is null)
        {
            await transaction.RollbackAsync(cancellationToken);
            return ContentInsertOutcome.SpaceNotFound;
        }

        if (currentCount >= itemCap)
        {
            await transaction.RollbackAsync(cancellationToken);
            return ContentInsertOutcome.AtCap;
        }

        dbContext.Set<Item>().Add(item);
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return ContentInsertOutcome.Inserted;
    }

    // Unlimited (Pro) path: no lock, no transaction — nothing to serialize
    // against when the cap is unbounded (mirrors CreateSpaceCommandHandler's
    // `if (spaceCap is int cap)` branch, which skips AddWithinSpaceCapAsync
    // entirely for Pro). Ownership is verified with an owner-scoped AnyAsync
    // before the insert so an unowned/unknown space cannot silently gain a zone.
    public async Task<bool> AddZoneAsync(Zone zone, string userId, CancellationToken cancellationToken = default)
    {
        var owned = await dbContext.Spaces.AnyAsync(s => s.Id == zone.SpaceId && s.UserId == userId, cancellationToken);
        if (!owned) return false;

        dbContext.Set<Zone>().Add(zone);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> AddItemAsync(Item item, string userId, CancellationToken cancellationToken = default)
    {
        var owned = await dbContext.Spaces.AnyAsync(s => s.Id == item.SpaceId && s.UserId == userId, cancellationToken);
        if (!owned) return false;

        dbContext.Set<Item>().Add(item);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> RemoveZoneWithItemsAsync(string spaceId, string zoneId, string userId, CancellationToken cancellationToken = default)
    {
        var zone = await GetZoneAsync(spaceId, zoneId, userId, cancellationToken);
        if (zone is null) return false;

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);

        // Set-based on purpose (SC-2): loading the zone's items to RemoveRange
        // them would materialise every photo data-URL in the zone into memory
        // just to delete rows — exactly the write/read amplification this task
        // exists to remove. ExecuteDeleteAsync bypasses the change tracker and
        // issues a single DELETE, but it also does NOT participate in
        // SaveChangesAsync, which is why this method opens its own explicit
        // transaction around both deletes.
        // zone.SpaceId (not the spaceId parameter) is used here on purpose. This is
        // the one place in this file that reaches an entity without the (spaceId,
        // userId) filter written inline (RemoveItemAsync below states its own
        // spaceId directly since B-22 — see its comment). It is not a gap in D-3:
        // `zone` was itself resolved via the owner-scoped GetZoneAsync immediately
        // above, so zone.SpaceId is already owner-verified. (Kept accurate per
        // security review S-L2 — if a second such place ever appears, D-3 has
        // stopped being structural and this comment is the tripwire.)
        await dbContext.Set<Item>()
            .Where(i => i.SpaceId == zone.SpaceId && i.ZoneId == zoneId)
            .ExecuteDeleteAsync(cancellationToken);

        dbContext.Set<Zone>().Remove(zone);
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    // Set-based on purpose, for the same reason as RemoveZoneWithItemsAsync's cascade
    // above (B-8 SC-2): resolving the item first via GetItemAsync would materialise the
    // whole row — including its nvarchar(max) Photo data-URL, megabytes for a Pro user —
    // into memory purely to delete it. Ownership stays structural (D-3): the query
    // filters directly on i.SpaceId == spaceId, plus an EXISTS confirming that space is
    // owned by userId, so an item is only ever removed when it belongs to the space in
    // the URL AND that space belongs to userId. A cross-user id, a cross-space id (a
    // real item id that exists but in a different space of the same or another user) or
    // an unknown id all affect 0 rows and return false, which the handler turns into the
    // same 404 — no divergence that would confirm the id exists anywhere.
    // B-22 (S-3): i.SpaceId == spaceId is stated inline as of B-22. To be precise about
    // why — the earlier form was NOT relying on ids being globally unique. It was already
    // entailed: s.Id == spaceId together with s.Id == i.SpaceId inside the EXISTS gives
    // i.SpaceId == spaceId by transitivity, so this DELETE was correctly scoped before the
    // key change and its behaviour is unchanged by it. (Review N2 corrected an earlier
    // version of this comment that misattributed the safety to global uniqueness.)
    // What the composite key changed is the margin for error, not the correctness: while a
    // bare Id was unique table-wide, even an under-scoped variant of this query could only
    // hit one row; now that the same Id can legitimately exist in many spaces, dropping the
    // correlation would delete across tenants. Hence stating the predicate directly rather
    // than leaving a future reader to re-derive it from the EXISTS.
    public async Task<bool> RemoveItemAsync(string spaceId, string itemId, string userId, CancellationToken cancellationToken = default)
    {
        var deleted = await dbContext.Set<Item>()
            .Where(i => i.SpaceId == spaceId
                        && i.Id == itemId
                        && dbContext.Spaces.Any(s => s.Id == spaceId && s.UserId == userId))
            .ExecuteDeleteAsync(cancellationToken);
        return deleted > 0;
    }
}
