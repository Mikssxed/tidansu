namespace Tidansu.Domain.Entities;

// Idempotency ledger for Stripe webhooks. Stripe delivers events at least once, so
// each processed event id is recorded here; the unique primary key is the dedupe key.
public class ProcessedStripeEvent
{
    // The Stripe event id (evt_...), used as the primary key.
    public string Id { get; set; } = null!;
    public string Type { get; set; } = null!;
    public DateTimeOffset ProcessedAt { get; set; }
}
