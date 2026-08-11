using Tidansu.Domain.Entities;

namespace Tidansu.Domain.Repositories;

public interface ITermsAcceptancesRepository
{
    Task<bool> ExistsAsync(string userId, string termsVersion, CancellationToken cancellationToken = default);
    Task AddAsync(TermsAcceptance acceptance, CancellationToken cancellationToken = default);
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
