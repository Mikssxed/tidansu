using MediatR;
using Microsoft.EntityFrameworkCore;
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
    IUserContext userContext,
    ISpaceIdGenerator spaceIdGenerator) : IRequestHandler<CreateSpaceCommand, SpaceDto>
{
    // Defense-in-depth only (B-23 S-4): a 128-bit CSPRNG collision is astronomically
    // rarer than a hardware fault, and even a residual DbUpdateException is mapped to a
    // byte-identical generic 500 by ErrorHandlingMiddleware (leaks nothing, since the id
    // was never client-chosen). This just avoids burning that 500 on a vanishing chance.
    private const int MaxIdCollisionRetries = 3;

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

        // B-23: the space id is server-assigned from a CSPRNG, generated after both gates
        // above and immediately before ToEntity — dto.Id (client-supplied) is never
        // trusted. This is what closes the cross-tenant collision/DoS/existence-oracle on
        // Space (B-22 § S-H1); Zone/Item ids stay client-supplied and space-scoped
        // (unchanged, B-22's composite-key territory).
        var spaceId = spaceIdGenerator.Generate();
        logger.LogInformation("Creating space {SpaceId} for user {UserId}", spaceId, userId);

        var spaceCap = PlanCaps.For(user.Plan).Spaces;
        for (var attempt = 1; ; attempt++)
        {
            var entity = dto.ToEntity(userId, spaceId);
            try
            {
                if (spaceCap is int cap)
                {
                    // Finite cap (Free): the pre-check above can race with concurrent
                    // same-user creates, so the actual cap is enforced atomically here.
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
            catch (DbUpdateException) when (attempt < MaxIdCollisionRetries)
            {
                spaceId = spaceIdGenerator.Generate();
                logger.LogWarning(
                    "Space id collision on attempt {Attempt} for user {UserId}; regenerating", attempt, userId);
            }
        }
    }
}
