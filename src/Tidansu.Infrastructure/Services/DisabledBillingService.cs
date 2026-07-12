using Microsoft.Extensions.Logging;
using Tidansu.Domain.Entities;
using Tidansu.Domain.Enums;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces;

namespace Tidansu.Infrastructure.Services;

// Production fallback when Stripe is deliberately off (Enabled=false). Unlike
// DirectBillingService it NEVER grants Pro without payment: an upgrade fails loud with
// BillingUnavailableException (surfaced as a clear "billing unavailable" outcome), while
// a downgrade to Free is a safe no-op. This closes the free-Pro-in-prod leak (FR-2).
public class DisabledBillingService(
    ILogger<DisabledBillingService> logger,
    IUserService userService) : IBillingService
{
    public async Task<BillingChangeResult> ChangePlanAsync(User user, Plan target, CancellationToken cancellationToken = default)
    {
        if (target == Plan.Pro)
        {
            // No payment provider is available — refuse rather than hand out free Pro.
            logger.LogWarning("Upgrade attempted while billing is disabled for user {UserId}", user.Id);
            throw new BillingUnavailableException();
        }

        // Downgrade is always safe: keep data, just drop to Free if not already there.
        if (user.Plan != Plan.Free)
        {
            user.Plan = Plan.Free;
            await userService.UpdateAsync(user, cancellationToken);
            logger.LogInformation("Downgrade applied for user {UserId} while billing is disabled", user.Id);
        }

        return BillingChangeResult.Applied;
    }

    // No provider to call back — nothing to process.
    public Task HandleWebhookAsync(string payload, string signature, CancellationToken cancellationToken = default)
        => Task.CompletedTask;
}
