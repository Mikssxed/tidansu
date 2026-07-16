using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Application.Spaces.Dtos;
using Tidansu.Application.User;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Spaces.Commands.UpdateSpaceFields;

public class UpdateSpaceFieldsCommandHandler(
    ILogger<UpdateSpaceFieldsCommandHandler> logger,
    ISpacesRepository spaces,
    IUserContext userContext) : IRequestHandler<UpdateSpaceFieldsCommand, SpaceFieldsDto>
{
    public async Task<SpaceFieldsDto> Handle(UpdateSpaceFieldsCommand request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;

        // Owner-scoped, no .Include of Zones/Items (FR-7 / B-14): renaming a space or
        // switching its view/canvas mode must not pull every item's photo data-URL just
        // to touch six scalar fields. null covers both "unknown id" and "another user's
        // space" — never a distinct 403 that would confirm existence (D-3).
        var existing = await spaces.GetByIdWithoutContentAsync(request.Id, userId, cancellationToken)
            ?? throw new NotFoundException("Space", request.Id);

        // No plan gate here, and deliberately no IUserService/FindByIdAsync call to load
        // one: renaming a space or changing its view/canvas mode moves no capped
        // dimension (space count is only checked at creation) — see D-1. Do not add a
        // check "to be safe"; there is no decision to make.
        var dto = request.Fields;
        existing.Name = dto.Name;
        existing.Type = dto.Type;
        existing.ViewMode = dto.ViewMode;
        existing.CanvasMode = dto.CanvasMode;
        existing.LayoutColumns = dto.LayoutColumns;
        existing.ColumnLabels = dto.ColumnLabels is null ? null : [.. dto.ColumnLabels];

        logger.LogInformation("Updating space fields for space {SpaceId} user {UserId}", existing.Id, userId);
        await spaces.SaveChangesAsync(cancellationToken);

        return SpaceFieldsDto.FromEntity(existing);
    }
}
