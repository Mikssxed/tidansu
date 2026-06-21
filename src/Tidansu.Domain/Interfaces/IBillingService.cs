using Tidansu.Domain.Entities;
using Tidansu.Domain.Enums;

namespace Tidansu.Domain.Interfaces;

// Seam between plan changes and the payment provider. The default (direct)
// implementation flips the plan immediately; the Stripe implementation returns a
// checkout URL for upgrades and applies the plan from a webhook.
public interface IBillingService
{
    /// <summary>
    /// Begins a plan change. Either applies it immediately (CheckoutUrl null) or, when
    /// payment is required, returns a CheckoutUrl the client should redirect to.
    /// </summary>
    Task<BillingChangeResult> ChangePlanAsync(User user, Plan target, CancellationToken cancellationToken = default);

    /// <summary>Processes a provider webhook (raw body + signature). No-op for direct billing.</summary>
    Task HandleWebhookAsync(string payload, string signature, CancellationToken cancellationToken = default);
}

public class BillingChangeResult
{
    public string? CheckoutUrl { get; init; }

    public static readonly BillingChangeResult Applied = new();
    public static BillingChangeResult Redirect(string url) => new() { CheckoutUrl = url };
}
