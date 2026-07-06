using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Application.Spaces.Dtos;
using Tidansu.Application.User;
using Tidansu.Domain.Constants;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Spaces.Commands.UpdateSpace;

public class UpdateSpaceCommandHandler(
    ILogger<UpdateSpaceCommandHandler> logger,
    ISpacesRepository spaces,
    IUserService userService,
    IUserContext userContext) : IRequestHandler<UpdateSpaceCommand, SpaceDto>
{
    public async Task<SpaceDto> Handle(UpdateSpaceCommand request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;
        var existing = await spaces.GetByIdAsync(request.Id, userId, cancellationToken)
            ?? throw new NotFoundException("Space", request.Id);

        var user = await userService.FindByIdAsync(userId, cancellationToken)
            ?? throw new AuthenticationException("user not found");

        var dto = request.Space;
        var before = new SpaceUsage(existing.Zones.Count, existing.Items.Count, existing.Items.Count(i => i.Photo is not null));
        var after = new SpaceUsage(dto.Zones.Count, dto.Items.Count, dto.Items.Count(i => i.Photo is not null));
        if (PlanPolicy.CheckSpaceMutation(user.Plan, before, after) is { } reason)
            throw new PlanLimitException(reason);

        // Scalar fields (existing is tracked → persisted by ReplaceAsync).
        existing.Name = dto.Name;
        existing.Type = dto.Type;
        existing.ViewMode = dto.ViewMode;
        existing.CanvasMode = dto.CanvasMode;
        existing.LayoutColumns = dto.LayoutColumns;
        existing.ColumnLabels = dto.ColumnLabels is null ? null : [.. dto.ColumnLabels];

        var zones = dto.Zones.Select(z => z.ToEntity(existing.Id)).ToList();
        var items = dto.Items.Select(i => i.ToEntity(existing.Id)).ToList();

        logger.LogInformation("Updating space {SpaceId} for user {UserId}", existing.Id, userId);
        await spaces.ReplaceAsync(existing, zones, items, cancellationToken);

        return SpaceDto.FromEntity(existing);
    }
}
