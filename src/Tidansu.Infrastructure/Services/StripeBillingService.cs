using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Stripe;
using Stripe.Checkout;
using Tidansu.Domain.Entities;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces;
using Plan = Tidansu.Domain.Enums.Plan;

namespace Tidansu.Infrastructure.Services;

// Stripe-backed billing — registered only when StripeSettings.IsConfigured.
// Upgrades create a Checkout session (the webhook applies Pro on payment);
// downgrades flip to Free directly. Built but not exercised until keys are set.
public class StripeBillingService : IBillingService
{
    private readonly ILogger<StripeBillingService> _logger;
    private readonly IUserService _userService;
    private readonly StripeSettings _settings;

    public StripeBillingService(
        ILogger<StripeBillingService> logger,
        IUserService userService,
        IOptions<StripeSettings> settings)
    {
        _logger = logger;
        _userService = userService;
        _settings = settings.Value;
        StripeConfiguration.ApiKey = _settings.SecretKey;
    }

    public async Task<BillingChangeResult> ChangePlanAsync(User user, Plan target, CancellationToken cancellationToken = default)
    {
        if (target == Plan.Free)
        {
            // TODO: also cancel the Stripe subscription. Plan flips immediately so the
            // app reflects the downgrade; over-cap data stays read-only.
            if (user.Plan != Plan.Free)
            {
                user.Plan = Plan.Free;
                await _userService.UpdateAsync(user, cancellationToken);
            }
            return BillingChangeResult.Applied;
        }

        if (user.Plan == Plan.Pro)
        {
            return BillingChangeResult.Applied;
        }

        // Upgrade → Stripe Checkout. The webhook promotes the user to Pro on success.
        var options = new SessionCreateOptions
        {
            Mode = "subscription",
            ClientReferenceId = user.Id,
            CustomerEmail = user.Email,
            SuccessUrl = _settings.SuccessUrl,
            CancelUrl = _settings.CancelUrl,
            LineItems = [new SessionLineItemOptions { Price = _settings.ProPriceId, Quantity = 1 }],
        };

        var session = await new SessionService().CreateAsync(options, cancellationToken: cancellationToken);
        _logger.LogInformation("Created Stripe checkout session {SessionId} for user {UserId}", session.Id, user.Id);

        return BillingChangeResult.Redirect(session.Url
            ?? throw new InvalidOperationException("Stripe returned no checkout URL."));
    }

    public async Task HandleWebhookAsync(string payload, string signature, CancellationToken cancellationToken = default)
    {
        Event stripeEvent;
        try
        {
            stripeEvent = EventUtility.ConstructEvent(payload, signature, _settings.WebhookSecret);
        }
        catch (StripeException ex)
        {
            // Bad/forged signature → 400 via ErrorHandlingMiddleware.
            throw new ValidationException(new Dictionary<string, string[]> { ["webhook"] = [ex.Message] });
        }

        if (stripeEvent.Type == "checkout.session.completed"
            && stripeEvent.Data.Object is Session session
            && !string.IsNullOrEmpty(session.ClientReferenceId))
        {
            var user = await _userService.FindByIdAsync(session.ClientReferenceId, cancellationToken);
            if (user is not null && user.Plan != Plan.Pro)
            {
                user.Plan = Plan.Pro;
                await _userService.UpdateAsync(user, cancellationToken);
                _logger.LogInformation("Stripe webhook upgraded user {UserId} to Pro", user.Id);
            }
        }
    }
}
