using Microsoft.EntityFrameworkCore;
using Tidansu.Domain.Entities;
using Tidansu.Domain.Repositories;
using Tidansu.Infrastructure.Persistence;

namespace Tidansu.Infrastructure.Repositories;

public class RefreshTokensRepository(TidansuDbContext dbContext) : IRefreshTokensRepository
{
    public async Task AddAsync(RefreshToken refreshToken, CancellationToken cancellationToken = default)
    {
        dbContext.RefreshTokens.Add(refreshToken);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<RefreshToken?> GetByHashAsync(string tokenHash, CancellationToken cancellationToken = default)
    {
        return await dbContext.RefreshTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash == tokenHash, cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default)
        => dbContext.SaveChangesAsync(cancellationToken);
}
