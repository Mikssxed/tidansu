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

        if (!PlanLimits.IsPro(user.Plan))
        {
            var existingCount = await spaces.CountByUserAsync(userId, cancellationToken);
            if (existingCount >= PlanLimits.FreeSpaces) throw new PlanLimitException(PlanLimitReasons.Spaces);
            if (dto.Zones.Count > PlanLimits.FreeZonesPerSpace) throw new PlanLimitException(PlanLimitReasons.Zones);
            if (dto.Items.Count > PlanLimits.FreeItemsPerSpace) throw new PlanLimitException(PlanLimitReasons.Items);
            if (!PlanLimits.AllowsPhotos(user.Plan) && dto.Items.Any(i => i.Photo is not null))
                throw new PlanLimitException(PlanLimitReasons.Photos);
        }

        logger.LogInformation("Creating space {SpaceId} for user {UserId}", dto.Id, userId);

        var entity = dto.ToEntity(userId);
        await spaces.AddAsync(entity, cancellationToken);

        return SpaceDto.FromEntity(entity);
    }
}
