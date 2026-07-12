namespace Tidansu.Domain.Interfaces;

// Idempotency ledger for Stripe webhooks. Infrastructure owns the EF-backed impl.
public interface IProcessedStripeEventStore
{
    /// <summary>
    /// Atomically records a Stripe event id as processed. Returns <c>false</c> if the
    /// event was already recorded (a duplicate at-least-once delivery), in which case
    /// the caller must skip processing.
    /// </summary>
    Task<bool> TryMarkProcessedAsync(string eventId, string eventType, CancellationToken cancellationToken = default);
}
