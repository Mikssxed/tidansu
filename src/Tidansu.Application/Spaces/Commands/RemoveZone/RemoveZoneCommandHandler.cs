using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Application.User;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Spaces.Commands.RemoveZone;

public class RemoveZoneCommandHandler(
    ILogger<RemoveZoneCommandHandler> logger,
    ISpacesRepository spaces,
    SpaceOverCapGuard overCapGuard,
    IUserContext userContext) : IRequestHandler<RemoveZoneCommand>
{
    public async Task Handle(RemoveZoneCommand request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;

        // B-24: explicit owner-scoped existence pre-check, added because the previous
        // 404 was decided only inside RemoveZoneWithItemsAsync — without this, a
        // non-owned/unknown zone id would reach the over-cap guard below, turning a
        // would-be 404 into a 403 that confirms the space exists (an existence oracle).
        // Not-found precedence must hold before the over-cap gate runs.
        if (!await spaces.ZoneExistsInSpaceAsync(request.SpaceId, request.ZoneId, userId, cancellationToken))
            throw new NotFoundException("Zone", request.ZoneId);

        // Is the whole space one of the account's excess spaces? Zone removal inside
        // an over-cap space is rejected, same as add/update (FR-4 — the whole space is
        // frozen, not just prevented from growing).
        await overCapGuard.EnsureSpaceContentWritableAsync(request.SpaceId, userId, cancellationToken);

        logger.LogInformation("Removing zone {ZoneId} from space {SpaceId} for user {UserId}", request.ZoneId, request.SpaceId, userId);

        // No plan gate: a delete never grows a capped dimension (D-1). Cascades to
        // every item placed in the zone (FR-3), set-based — see RemoveZoneWithItemsAsync.
        // The false→404 here is now only a concurrent-delete backstop — the existence
        // pre-check above already decided the ordinary not-found case.
        var removed = await spaces.RemoveZoneWithItemsAsync(request.SpaceId, request.ZoneId, userId, cancellationToken);
        if (!removed) throw new NotFoundException("Zone", request.ZoneId);
    }
}
