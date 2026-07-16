using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Application.User;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Spaces.Commands.RemoveZone;

public class RemoveZoneCommandHandler(
    ILogger<RemoveZoneCommandHandler> logger,
    ISpacesRepository spaces,
    IUserContext userContext) : IRequestHandler<RemoveZoneCommand>
{
    public async Task Handle(RemoveZoneCommand request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;

        logger.LogInformation("Removing zone {ZoneId} from space {SpaceId} for user {UserId}", request.ZoneId, request.SpaceId, userId);

        // No plan gate: a delete never grows a capped dimension (D-1). Cascades to
        // every item placed in the zone (FR-3), set-based — see RemoveZoneWithItemsAsync.
        var removed = await spaces.RemoveZoneWithItemsAsync(request.SpaceId, request.ZoneId, userId, cancellationToken);
        if (!removed) throw new NotFoundException("Zone", request.ZoneId);
    }
}
