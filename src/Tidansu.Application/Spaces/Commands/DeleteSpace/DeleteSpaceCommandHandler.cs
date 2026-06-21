using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Application.User;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Spaces.Commands.DeleteSpace;

public class DeleteSpaceCommandHandler(
    ILogger<DeleteSpaceCommandHandler> logger,
    ISpacesRepository spaces,
    IUserContext userContext) : IRequestHandler<DeleteSpaceCommand>
{
    public async Task Handle(DeleteSpaceCommand request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;
        var space = await spaces.GetByIdAsync(request.Id, userId, cancellationToken)
            ?? throw new NotFoundException("Space", request.Id);

        logger.LogInformation("Deleting space {SpaceId} for user {UserId}", space.Id, userId);
        spaces.Remove(space);
        await spaces.SaveChangesAsync(cancellationToken);
    }
}
