using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Application.Spaces.Dtos;
using Tidansu.Application.User;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Spaces.Commands.UpdateZone;

public class UpdateZoneCommandHandler(
    ILogger<UpdateZoneCommandHandler> logger,
    ISpacesRepository spaces,
    SpaceOverCapGuard overCapGuard,
    IUserContext userContext) : IRequestHandler<UpdateZoneCommand, ZoneDto>
{
    public async Task<ZoneDto> Handle(UpdateZoneCommand request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;

        // Owner-scoped, tracked (D-3). null covers both "unknown id" and
        // "another user's zone" — never a distinct 403 that would confirm existence.
        var zone = await spaces.GetZoneAsync(request.SpaceId, request.ZoneId, userId, cancellationToken)
            ?? throw new NotFoundException("Zone", request.ZoneId);

        // B-24: is the whole space one of the account's excess spaces? Orthogonal to
        // the per-zone count gate below (there is none, deliberately — see next
        // comment); this rejects the update entirely when the space itself is over cap.
        await overCapGuard.EnsureSpaceContentWritableAsync(request.SpaceId, userId, cancellationToken);

        // No per-zone count gate here, deliberately: no zone field moves a capped
        // dimension (D-1 — updates never change a count, so CheckSpaceMutation's
        // `after > before` conjunct is always false). This is what keeps a downgraded
        // Free user able to edit their under-cap zones. Do not add a `count >= cap`
        // check here — the over-cap gate above is the only gate this update needs.
        var dto = request.Zone;
        zone.Label = dto.Label;
        zone.Color = dto.Color;
        zone.Kind = dto.Kind;
        zone.Facing = dto.Facing;
        zone.Position = dto.Position;
        zone.Column = dto.Column;
        zone.GridCols = dto.GridCols;
        zone.GridRows = dto.GridRows;
        zone.HasDepth = dto.HasDepth;
        zone.Floor = dto.Floor;
        zone.Levels = dto.Levels;
        zone.RectX = dto.Rect?.X;
        zone.RectY = dto.Rect?.Y;
        zone.RectW = dto.Rect?.W;
        zone.RectH = dto.Rect?.H;

        logger.LogInformation("Updating zone {ZoneId} in space {SpaceId} for user {UserId}", request.ZoneId, request.SpaceId, userId);
        await spaces.SaveChangesAsync(cancellationToken);

        return ZoneDto.FromEntity(zone);
    }
}
