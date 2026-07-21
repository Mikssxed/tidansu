using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Application.Spaces.Dtos;
using Tidansu.Application.User;
using Tidansu.Domain.Constants;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Spaces.Commands.AddZone;

public class AddZoneCommandHandler(
    ILogger<AddZoneCommandHandler> logger,
    ISpacesRepository spaces,
    IUserService userService,
    IUserContext userContext) : IRequestHandler<AddZoneCommand, ZoneDto>
{
    public async Task<ZoneDto> Handle(AddZoneCommand request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;
        var user = await userService.FindByIdAsync(userId, cancellationToken)
            ?? throw new AuthenticationException("user not found");

        // Owner-scoped first (D-3): unknown/other-user space id 404s before anything
        // else runs, including before any lock is taken.
        var currentZones = await spaces.CountZonesAsync(request.SpaceId, userId, cancellationToken)
            ?? throw new NotFoundException("Space", request.SpaceId);

        // Cheap pre-check, no lock: keeps the ordinary at-cap rejection at today's
        // latency (mirrors CreateSpaceCommandHandler). `before >= cap` is exactly
        // CheckSpaceMutation's rule specialised to a +1 delta — see PlanPolicy D-1.
        if (PlanPolicy.CheckAddZone(user.Plan, currentZones) is { } reason)
            throw new PlanLimitException(reason);

        // In-space duplicate-id pre-check (F-6): after the 404/403 gates above, before
        // the insert. ZoneExistsInSpaceAsync is owner-scoped (D-3), so this can only
        // ever observe the caller's own space — no new existence oracle. It is a
        // check-then-insert race, not enforcement (C-5): a concurrent duplicate add can
        // still slip past into the composite-key constraint, which is what the
        // ErrorHandlingMiddleware DbUpdateException backstop is for. Do not widen
        // sp_getapplock to close that race — it would serialize every add for a case
        // that costs nothing and leaks nothing.
        if (await spaces.ZoneExistsInSpaceAsync(request.SpaceId, request.Zone.Id, userId, cancellationToken))
            throw new ValidationException(new Dictionary<string, string[]>
            {
                ["Zone.Id"] = ["A zone with this id already exists in this space."],
            });

        var entity = request.Zone.ToEntity(request.SpaceId);
        var zoneCap = PlanCaps.For(user.Plan).Zones;

        logger.LogInformation("Adding zone {ZoneId} to space {SpaceId} for user {UserId}", entity.Id, request.SpaceId, userId);

        if (zoneCap is int cap)
        {
            // Finite cap (Free): the pre-check above can race with concurrent adds
            // against the same space, so the actual cap is enforced atomically here
            // (D-4 — per-space sp_getapplock, shared with AddItem's insert).
            var outcome = await spaces.AddZoneWithinCapAsync(entity, userId, cap, cancellationToken);
            switch (outcome)
            {
                case ContentInsertOutcome.AtCap:
                    logger.LogWarning(
                        "Zone cap race lost for space {SpaceId}: concurrent add rejected at cap {Cap}", request.SpaceId, cap);
                    throw new PlanLimitException(PlanLimitReasons.Zones);
                case ContentInsertOutcome.SpaceNotFound:
                    throw new NotFoundException("Space", request.SpaceId);
            }
        }
        else
        {
            // Unlimited (Pro): no lock, no serialization of concurrent adds.
            var added = await spaces.AddZoneAsync(entity, userId, cancellationToken);
            if (!added) throw new NotFoundException("Space", request.SpaceId);
        }

        return ZoneDto.FromEntity(entity);
    }
}
