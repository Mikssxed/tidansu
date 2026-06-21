using Microsoft.Extensions.Logging;
using Tidansu.Domain.Entities;
using Tidansu.Domain.Enums;
using Tidansu.Domain.Interfaces;

namespace Tidansu.Infrastructure.Services;

// Default billing: flips the plan immediately, no payment (the "flag-now" mode).
public class DirectBillingService(
    ILogger<DirectBillingService> logger,
    IUserService userService) : IBillingService
{
    public async Task<BillingChangeResult> ChangePlanAsync(User user, Plan target, CancellationToken cancellationToken = default)
    {
        if (user.Plan != target)
        {
            user.Plan = target;
            await userService.UpdateAsync(user, cancellationToken);
            logger.LogInformation("Direct plan change applied for user {UserId}: {Plan}", user.Id, target);
        }

        return BillingChangeResult.Applied;
    }

    // No provider to call back — webhooks are a Stripe-only concern.
    public Task HandleWebhookAsync(string payload, string signature, CancellationToken cancellationToken = default)
        => Task.CompletedTask;
}
