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

    // Legal-checkout hooks (FR-10/11/12) — all off/blank by default so test mode passes
    // with them off and they can be flipped on at go-live without code changes. They are
    // optional and intentionally NOT part of IsConfigured.
    public bool TaxEnabled { get; set; }                  // FR-10 Stripe Tax
    public bool ConsentRequired { get; set; }             // FR-11 pre-purchase consent
    public string? TermsOfServiceUrl { get; set; }        // FR-11
    public string? PrivacyUrl { get; set; }               // FR-11
    public string? WithdrawalUrl { get; set; }            // FR-11
    public bool InvoicingEnabled { get; set; }            // FR-12 Stripe Invoicing

    public bool IsConfigured =>
        Enabled
        && !string.IsNullOrWhiteSpace(SecretKey)
        && !string.IsNullOrWhiteSpace(WebhookSecret)
        && !string.IsNullOrWhiteSpace(ProPriceId);
}
