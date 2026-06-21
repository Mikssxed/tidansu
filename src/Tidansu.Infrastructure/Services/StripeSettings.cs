namespace Tidansu.Infrastructure.Services;

public class StripeSettings
{
    // Off by default — the app uses DirectBillingService until Stripe is configured.
    public bool Enabled { get; set; }
    public string? SecretKey { get; set; }
    public string? WebhookSecret { get; set; }
    public string? ProPriceId { get; set; }
    public string? SuccessUrl { get; set; }
    public string? CancelUrl { get; set; }

    public bool IsConfigured =>
        Enabled
        && !string.IsNullOrWhiteSpace(SecretKey)
        && !string.IsNullOrWhiteSpace(ProPriceId);
}
