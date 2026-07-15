using Tidansu.Domain.Entities;

namespace Tidansu.Domain.Repositories;

public interface ISpacesRepository
{
    Task<List<Space>> GetAllByUserAsync(string userId, CancellationToken cancellationToken = default);
    Task<Space?> GetByIdAsync(string id, string userId, CancellationToken cancellationToken = default);
    Task<int> CountByUserAsync(string userId, CancellationToken cancellationToken = default);

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

    /// <summary>
    /// Replaces a tracked space's zones/items with new sets (delete-then-insert),
    /// persisting scalar changes on <paramref name="existing"/> too.
    /// </summary>
    Task ReplaceAsync(Space existing, List<Zone> zones, List<Item> items, CancellationToken cancellationToken = default);

    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
