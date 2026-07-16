using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Application.User;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Spaces.Commands.RemoveItem;

public class RemoveItemCommandHandler(
    ILogger<RemoveItemCommandHandler> logger,
    ISpacesRepository spaces,
    IUserContext userContext) : IRequestHandler<RemoveItemCommand>
{
    public async Task Handle(RemoveItemCommand request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;

        logger.LogInformation("Removing item {ItemId} from space {SpaceId} for user {UserId}", request.ItemId, request.SpaceId, userId);

        // No plan gate: a delete never grows a capped dimension (D-1).
        var removed = await spaces.RemoveItemAsync(request.SpaceId, request.ItemId, userId, cancellationToken);
        if (!removed) throw new NotFoundException("Item", request.ItemId);
    }
}
