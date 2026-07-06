using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Application.Account.Dtos;
using Tidansu.Application.User;
using Tidansu.Domain.Constants;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Account.Commands.SetSync;

public class SetSyncCommandHandler(
    ILogger<SetSyncCommandHandler> logger,
    IUserService userService,
    ISpacesRepository spaces,
    IUserContext userContext) : IRequestHandler<SetSyncCommand, AccountDto>
{
    public async Task<AccountDto> Handle(SetSyncCommand request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;
        var user = await userService.FindByIdAsync(userId, cancellationToken)
            ?? throw new AuthenticationException("user not found");

        // Sync is a Pro capability — turning it on requires the plan's sync gate.
        if (request.SyncOn && !PlanCaps.For(user.Plan).Sync)
        {
            throw new PlanLimitException(PlanLimitReasons.Sync);
        }

        if (user.SyncOn != request.SyncOn)
        {
            logger.LogInformation("Setting sync={SyncOn} for user {UserId}", request.SyncOn, userId);
            user.SyncOn = request.SyncOn;
            await userService.UpdateAsync(user, cancellationToken);
        }

        var userSpaces = await spaces.GetAllByUserAsync(userId, cancellationToken);
        return AccountDto.From(user, UsageDto.From(userSpaces));
    }
}
