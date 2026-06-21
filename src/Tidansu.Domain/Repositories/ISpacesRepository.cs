using Tidansu.Domain.Entities;

namespace Tidansu.Domain.Repositories;

public interface ISpacesRepository
{
    Task<List<Space>> GetAllByUserAsync(string userId, CancellationToken cancellationToken = default);
    Task<Space?> GetByIdAsync(string id, string userId, CancellationToken cancellationToken = default);
    Task<int> CountByUserAsync(string userId, CancellationToken cancellationToken = default);
    Task AddAsync(Space space, CancellationToken cancellationToken = default);
    void Remove(Space space);

    /// <summary>
    /// Replaces a tracked space's zones/items with new sets (delete-then-insert),
    /// persisting scalar changes on <paramref name="existing"/> too.
    /// </summary>
    Task ReplaceAsync(Space existing, List<Zone> zones, List<Item> items, CancellationToken cancellationToken = default);

    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
