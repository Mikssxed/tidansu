using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Application.User;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Spaces.Commands.RemoveItem;

public class RemoveItemCommandHandler(
    ILogger<RemoveItemCommandHandler> logger,
    ISpacesRepository spaces,
    SpaceOverCapGuard overCapGuard,
    IUserContext userContext) : IRequestHandler<RemoveItemCommand>
{
    public async Task Handle(RemoveItemCommand request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;

        // B-24: explicit owner-scoped existence pre-check, added because the previous
        // 404 was decided only inside RemoveItemAsync — without this, a non-owned/
        // unknown item id would reach the over-cap guard below, turning a would-be 404
        // into a 403 that confirms the space exists (an existence oracle). Not-found
        // precedence must hold before the over-cap gate runs.
        if (!await spaces.ItemExistsInSpaceAsync(request.SpaceId, request.ItemId, userId, cancellationToken))
            throw new NotFoundException("Item", request.ItemId);

        // Is the whole space one of the account's excess spaces? Item removal inside
        // an over-cap space is rejected, same as add/update (FR-4).
        await overCapGuard.EnsureSpaceContentWritableAsync(request.SpaceId, userId, cancellationToken);

        logger.LogInformation("Removing item {ItemId} from space {SpaceId} for user {UserId}", request.ItemId, request.SpaceId, userId);

        // No plan gate: a delete never grows a capped dimension (D-1). The false→404
        // here is now only a concurrent-delete backstop — the existence pre-check
        // above already decided the ordinary not-found case.
        var removed = await spaces.RemoveItemAsync(request.SpaceId, request.ItemId, userId, cancellationToken);
        if (!removed) throw new NotFoundException("Item", request.ItemId);
    }
}
