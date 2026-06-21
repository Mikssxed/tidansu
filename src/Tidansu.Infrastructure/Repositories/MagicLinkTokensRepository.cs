using Microsoft.EntityFrameworkCore;
using Tidansu.Domain.Entities;
using Tidansu.Domain.Repositories;
using Tidansu.Infrastructure.Persistence;

namespace Tidansu.Infrastructure.Repositories;

public class MagicLinkTokensRepository(TidansuDbContext dbContext) : IMagicLinkTokensRepository
{
    public async Task AddAsync(MagicLinkToken token, CancellationToken cancellationToken = default)
    {
        dbContext.MagicLinkTokens.Add(token);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public Task<MagicLinkToken?> GetByHashAsync(string tokenHash, CancellationToken cancellationToken = default)
        => dbContext.MagicLinkTokens.FirstOrDefaultAsync(t => t.TokenHash == tokenHash, cancellationToken);

    public async Task InvalidateActiveForEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        await dbContext.MagicLinkTokens
            .Where(t => t.Email == email && t.ConsumedAt == null && t.ExpiresAt > now)
            .ExecuteUpdateAsync(set => set.SetProperty(t => t.ConsumedAt, now), cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default)
        => dbContext.SaveChangesAsync(cancellationToken);
}
