using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Application.Account.Dtos;
using Tidansu.Application.User;
using Tidansu.Domain.Enums;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Account.Commands.ChangePlan;

public class ChangePlanCommandHandler(
    ILogger<ChangePlanCommandHandler> logger,
    IUserService userService,
    IBillingService billing,
    ISpacesRepository spaces,
    IUserContext userContext) : IRequestHandler<ChangePlanCommand, ChangePlanResult>
{
    public async Task<ChangePlanResult> Handle(ChangePlanCommand request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;
        var user = await userService.FindByIdAsync(userId, cancellationToken)
            ?? throw new AuthenticationException("user not found");

        var target = request.Plan == "pro" ? Plan.Pro : Plan.Free;

        // The billing seam decides the outcome: apply now, redirect to checkout
        // (Stripe upgrade), or schedule an end-of-period cancellation (the plan stays
        // Pro until ProAccessUntil and flips later via webhook — not synchronously).
        // Downgrade keeps all data — over-cap content just becomes read-only once it
        // takes effect.
        logger.LogInformation("Plan change requested for user {UserId}: {From} → {To}", userId, user.Plan, target);
        var result = await billing.ChangePlanAsync(user, target, cancellationToken);

        var itemCountsPerSpace = await spaces.GetItemCountsPerSpaceAsync(userId, cancellationToken);
        return new ChangePlanResult
        {
            Account = AccountDto.From(user, UsageDto.From(itemCountsPerSpace)),
            CheckoutUrl = result.CheckoutUrl,
            CancellationScheduled = result.CancellationScheduled,
            ProAccessUntil = result.ProAccessUntil,
        };
    }
}
