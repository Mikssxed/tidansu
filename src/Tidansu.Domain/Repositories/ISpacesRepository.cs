using Tidansu.Domain.Entities;

namespace Tidansu.Domain.Repositories;

public interface ISpacesRepository
{
    Task<Space?> GetByIdAsync(string id, string userId, CancellationToken cancellationToken = default);
    Task<int> CountByUserAsync(string userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// A page of the user's spaces, projected to list-card summary columns only — no
    /// zones, items, or photo payloads (B-16 / SC-3). Ordered by the stable key
    /// <c>Id</c> before <c>Skip/Take</c> so paging is deterministic across requests.
    /// Do not "simplify" this back into <see cref="GetByIdAsync"/>-style graph loads
    /// plus in-memory paging/mapping — that reintroduces the whole-account payload
    /// this method exists to remove.
    /// </summary>
    Task<List<SpaceSummary>> GetSpaceSummariesPageAsync(string userId, int skip, int take, CancellationToken cancellationToken = default);

    /// <summary>
    /// The read-only, photo-less full graph (zones + items) for one owner-scoped
    /// space — every item's <c>Photo</c> is left <c>null</c>, so the column never
    /// leaves SQL (B-16 / SC-3). <c>AsNoTracking</c>. Distinct from
    /// <see cref="GetByIdAsync"/>, which stays tracked and photo-bearing for
    /// <c>DeleteSpaceCommandHandler</c>'s cascade — do not merge the two.
    /// <c>null</c> when the space does not exist or is not owned by
    /// <paramref name="userId"/>.
    /// </summary>
    Task<Space?> GetLayoutByIdAsync(string id, string userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns one element per space owned by the user, each the item count of that
    /// space; order is unspecified. A user with no spaces gets an empty list, never
    /// <c>null</c>. Deliberately loads no zones, items, or photo payloads — this exists
    /// only to feed the account page's usage meters (spaces/items/fullest-space) without
    /// paying for the full space graph.
    /// </summary>
    Task<List<int>> GetItemCountsPerSpaceAsync(string userId, CancellationToken cancellationToken = default);

    Task AddAsync(Space space, CancellationToken cancellationToken = default);

    /// <summary>
    /// Atomically inserts <paramref name="space"/> only if the user is still under
    /// <paramref name="spaceCap"/>, serializing concurrent same-user creates. Returns
    /// <c>true</c> when inserted, <c>false</c> when an authoritative in-lock re-count
    /// found the user already at/over the cap (the caller should treat this as an
    /// ordinary plan-limit rejection). Throws if the underlying per-user lock cannot be
    /// acquired (a transient infrastructure condition, not an at-cap decision — the
    /// caller must not translate this into a plan-limit rejection).
    /// </summary>
    Task<bool> AddWithinSpaceCapAsync(Space space, int spaceCap, CancellationToken cancellationToken = default);

    void Remove(Space space);

    Task SaveChangesAsync(CancellationToken cancellationToken = default);

    // ---- Granular per-entity access (B-15) -------------------------------------
    //
    // Every method below carries userId BY DESIGN (D-3): a zone/item is always
    // reached through `dbContext.Spaces.Where(s => s.Id == spaceId && s.UserId ==
    // userId)`, so there is no overload that resolves a zone/item by bare id — an
    // unscoped, cross-user mutation is not expressible through this interface at
    // all. Do not add a convenience overload without userId; that would reopen the
    // exact "one of 7 call sites forgot the owner check" risk this shape exists to
    // close. A miss (unknown id OR another user's id — the two cannot diverge)
    // returns null/false, which the caller turns into a 404 — never a 403 that would
    // confirm the id exists.

    /// <summary>
    /// Loads a space's own scalar fields only — no <c>.Include</c> of Zones or Items.
    /// Do not reuse <see cref="GetByIdAsync"/> for this: it includes Zones + Items,
    /// i.e. every item's photo data-URL, just to rename a space (FR-7 / B-14's
    /// removed cost). <c>null</c> when the space does not exist or is not owned by
    /// <paramref name="userId"/>.
    /// </summary>
    Task<Space?> GetByIdWithoutContentAsync(string id, string userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// The owner-scoped zone count for a space — a <c>SELECT COUNT(*)</c>, not a
    /// graph load. <c>null</c> when the space does not exist or is not owned by
    /// <paramref name="userId"/>.
    /// </summary>
    Task<int?> CountZonesAsync(string spaceId, string userId, CancellationToken cancellationToken = default);

    /// <summary>Same as <see cref="CountZonesAsync"/>, for items.</summary>
    Task<int?> CountItemsAsync(string spaceId, string userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Loads a single owner-scoped zone, tracked (the caller mutates and calls
    /// <see cref="SaveChangesAsync"/>). <c>null</c> when the zone/space does not
    /// exist or is not owned by <paramref name="userId"/>.
    /// </summary>
    Task<Zone?> GetZoneAsync(string spaceId, string zoneId, string userId, CancellationToken cancellationToken = default);

    /// <summary>Same as <see cref="GetZoneAsync"/>, for a single item.</summary>
    Task<Item?> GetItemAsync(string spaceId, string itemId, string userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Whether <paramref name="zoneId"/> belongs to a space owned by
    /// <paramref name="userId"/> (FR-4/FR-5's referential check on an item's zone).
    /// </summary>
    Task<bool> ZoneExistsInSpaceAsync(string spaceId, string zoneId, string userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Whether <paramref name="itemId"/> already exists in the space owned by
    /// <paramref name="userId"/> (in-space duplicate-id pre-check — F-6). Owner-scoped
    /// like every other method here (D-3): it can only ever observe the caller's own
    /// space, so it introduces no new existence oracle.
    /// </summary>
    Task<bool> ItemExistsInSpaceAsync(string spaceId, string itemId, string userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Atomically inserts <paramref name="zone"/> only if the owning space's zone
    /// count is still under <paramref name="zoneCap"/>, serializing concurrent
    /// same-space zone adds (Free plans only — see D-4). Returns
    /// <see cref="ContentInsertOutcome.Inserted"/> on success,
    /// <see cref="ContentInsertOutcome.AtCap"/> when an authoritative in-lock
    /// re-count found the space already at/over the cap (the caller should treat
    /// this as an ordinary plan-limit rejection), or
    /// <see cref="ContentInsertOutcome.SpaceNotFound"/> when the space vanished
    /// (e.g. a concurrent delete) or is not owned by <paramref name="userId"/>.
    /// Throws if the underlying per-space lock cannot be acquired (a transient
    /// infrastructure condition, not an at-cap decision — the caller must not
    /// translate this into a plan-limit rejection).
    /// </summary>
    Task<ContentInsertOutcome> AddZoneWithinCapAsync(Zone zone, string userId, int zoneCap, CancellationToken cancellationToken = default);

    /// <summary>Same contract as <see cref="AddZoneWithinCapAsync"/>, for an item.</summary>
    Task<ContentInsertOutcome> AddItemWithinCapAsync(Item item, string userId, int itemCap, CancellationToken cancellationToken = default);

    /// <summary>
    /// Inserts <paramref name="zone"/> with no cap check and no lock — the unlimited
    /// (Pro) path. Returns <c>false</c> when the owning space does not exist or is
    /// not owned by <paramref name="userId"/>.
    /// </summary>
    Task<bool> AddZoneAsync(Zone zone, string userId, CancellationToken cancellationToken = default);

    /// <summary>Same contract as <see cref="AddZoneAsync"/>, for an item.</summary>
    Task<bool> AddItemAsync(Item item, string userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Removes an owner-scoped zone and cascades to every item placed inside it
    /// (FR-3 — matches today's whole-space-resend behaviour, made explicit and
    /// testable). Returns <c>false</c> when the zone/space does not exist or is not
    /// owned by <paramref name="userId"/>.
    /// </summary>
    Task<bool> RemoveZoneWithItemsAsync(string spaceId, string zoneId, string userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Removes an owner-scoped item. Returns <c>false</c> when the item/space does
    /// not exist or is not owned by <paramref name="userId"/>.
    /// </summary>
    Task<bool> RemoveItemAsync(string spaceId, string itemId, string userId, CancellationToken cancellationToken = default);
}
