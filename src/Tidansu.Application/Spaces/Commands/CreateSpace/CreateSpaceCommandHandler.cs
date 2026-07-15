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

        // Cheap pre-check, no lock: keeps the common path and the ordinary at-cap
        // rejection at their current latency/behaviour. Zones/items/photos caps on the
        // submitted graph are only ever checked here (they don't need the atomic path).
        var existingCount = await spaces.CountByUserAsync(userId, cancellationToken);
        var usage = new SpaceUsage(dto.Zones.Count, dto.Items.Count, dto.Items.Count(i => i.Photo is not null));
        if (PlanPolicy.CheckNewSpace(user.Plan, existingCount, usage) is { } reason)
            throw new PlanLimitException(reason);

        // Must run after the plan gate above and before ToEntity/persistence: a Free user
        // sending a photo (valid or invalid) still gets 403 {plan:["photos"]}, never this
        // guard's 400 (B-13 D-8.1). Also must stay outside AddWithinSpaceCapAsync's
        // sp_getapplock below — never scan photos while holding a per-user DB lock.
        SpacePhotoGuard.ThrowIfInvalid(dto);

        logger.LogInformation("Creating space {SpaceId} for user {UserId}", dto.Id, userId);

        var entity = dto.ToEntity(userId);
        var spaceCap = PlanCaps.For(user.Plan).Spaces;
        if (spaceCap is int cap)
        {
            // Finite cap (Free): the pre-check above can race with concurrent same-user
            // creates, so the actual cap is enforced atomically here.
            var inserted = await spaces.AddWithinSpaceCapAsync(entity, cap, cancellationToken);
            if (!inserted)
            {
                logger.LogWarning(
                    "Space cap race lost for user {UserId}: concurrent create rejected at cap {Cap}", userId, cap);
                throw new PlanLimitException(PlanLimitReasons.Spaces);
            }
        }
        else
        {
            // Unlimited (Pro): no lock, no serialization of concurrent creates.
            await spaces.AddAsync(entity, cancellationToken);
        }

        return SpaceDto.FromEntity(entity);
    }
}
