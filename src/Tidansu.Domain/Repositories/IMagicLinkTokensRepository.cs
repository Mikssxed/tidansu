using Tidansu.Domain.Entities;

namespace Tidansu.Domain.Repositories;

public interface IMagicLinkTokensRepository
{
    Task AddAsync(MagicLinkToken token, CancellationToken cancellationToken = default);
    Task<MagicLinkToken?> GetByHashAsync(string tokenHash, CancellationToken cancellationToken = default);
    // Invalidate any still-active links for an email when a fresh one is requested.
    Task InvalidateActiveForEmailAsync(string email, CancellationToken cancellationToken = default);
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
