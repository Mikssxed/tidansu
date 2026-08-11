using Microsoft.EntityFrameworkCore;
using Tidansu.Domain.Entities;
using Tidansu.Domain.Repositories;
using Tidansu.Infrastructure.Persistence;

namespace Tidansu.Infrastructure.Repositories;

public class TermsAcceptancesRepository(TidansuDbContext dbContext) : ITermsAcceptancesRepository
{
    public Task<bool> ExistsAsync(string userId, string termsVersion, CancellationToken cancellationToken = default)
        => dbContext.TermsAcceptances.AnyAsync(a => a.UserId == userId && a.TermsVersion == termsVersion, cancellationToken);

    public async Task AddAsync(TermsAcceptance acceptance, CancellationToken cancellationToken = default)
    {
        dbContext.TermsAcceptances.Add(acceptance);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // A concurrent double-consume can race past the ExistsAsync check and both insert;
            // the (UserId, TermsVersion) unique index rejects the loser. That row already exists,
            // so the acceptance is recorded — treat the collision as idempotent success. Detach
            // the rejected entry so the failed insert doesn't linger in the change tracker.
            dbContext.Entry(acceptance).State = EntityState.Detached;
        }
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default)
        => dbContext.SaveChangesAsync(cancellationToken);
}
