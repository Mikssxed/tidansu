using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Application.Spaces.Dtos;
using Tidansu.Application.User;
using Tidansu.Domain.Constants;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Spaces.Commands.CreateSpace;

public class CreateSpaceCommandHandler(
    ILogger<CreateSpaceCommandHandler> logger,
    ISpacesRepository spaces,
    IUserService userService,
    IUserContext userContext) : IRequestHandler<CreateSpaceCommand, SpaceDto>
{
    public async Task<SpaceDto> Handle(CreateSpaceCommand request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;
        var user = await userService.FindByIdAsync(userId, cancellationToken)
            ?? throw new AuthenticationException("user not found");

        var dto = request.Space;

        var existingCount = await spaces.CountByUserAsync(userId, cancellationToken);
        var usage = new SpaceUsage(dto.Zones.Count, dto.Items.Count, dto.Items.Count(i => i.Photo is not null));
        if (PlanPolicy.CheckNewSpace(user.Plan, existingCount, usage) is { } reason)
            throw new PlanLimitException(reason);

        logger.LogInformation("Creating space {SpaceId} for user {UserId}", dto.Id, userId);

        var entity = dto.ToEntity(userId);
        await spaces.AddAsync(entity, cancellationToken);

        return SpaceDto.FromEntity(entity);
    }
}
