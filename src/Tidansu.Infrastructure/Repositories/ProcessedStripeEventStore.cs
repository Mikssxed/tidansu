using Microsoft.EntityFrameworkCore;
using Tidansu.Domain.Entities;
using Tidansu.Domain.Interfaces;
using Tidansu.Infrastructure.Persistence;

namespace Tidansu.Infrastructure.Repositories;

// EF-backed idempotency ledger. Insert-first, catch-duplicate: the unique primary key
// makes a concurrent second delivery fail atomically, so there is no read-then-write
// race between two of Stripe's at-least-once retries.
public class ProcessedStripeEventStore(TidansuDbContext dbContext) : IProcessedStripeEventStore
{
    public async Task<bool> TryMarkProcessedAsync(string eventId, string eventType, CancellationToken cancellationToken = default)
    {
        dbContext.ProcessedStripeEvents.Add(new ProcessedStripeEvent
        {
            Id = eventId,
            Type = eventType,
            ProcessedAt = DateTimeOffset.UtcNow,
        });

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (DbUpdateException)
        {
            // Primary-key violation → this event was already recorded by a prior delivery.
            // Detach the failed insert so the context stays usable, then report duplicate.
            dbContext.ChangeTracker.Clear();
            return false;
        }
    }
}
