using Microsoft.EntityFrameworkCore;
using Tidansu.Domain.Entities;
using Tidansu.Domain.Repositories;
using Tidansu.Infrastructure.Persistence;

namespace Tidansu.Infrastructure.Repositories;

public class SpacesRepository(TidansuDbContext dbContext) : ISpacesRepository
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

    public async Task AddAsync(Space space, CancellationToken cancellationToken = default)
    {
        dbContext.Spaces.Add(space);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

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
