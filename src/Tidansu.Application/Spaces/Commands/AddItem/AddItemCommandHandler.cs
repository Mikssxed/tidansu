using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Application.Spaces.Dtos;
using Tidansu.Application.User;
using Tidansu.Domain.Constants;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Spaces.Commands.AddItem;

public class AddItemCommandHandler(
    ILogger<AddItemCommandHandler> logger,
    ISpacesRepository spaces,
    IUserService userService,
    IUserContext userContext) : IRequestHandler<AddItemCommand, ItemDto>
{
    public async Task<ItemDto> Handle(AddItemCommand request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;
        var user = await userService.FindByIdAsync(userId, cancellationToken)
            ?? throw new AuthenticationException("user not found");

        var dto = request.Item;

        // Owner-scoped first (D-3): unknown/other-user space id 404s before anything
        // else runs.
        var currentItems = await spaces.CountItemsAsync(request.SpaceId, userId, cancellationToken)
            ?? throw new NotFoundException("Space", request.SpaceId);

        // FR-4: the item's zone must belong to a space the caller owns. New referential
        // check — ZoneId has no FK (see Item.cs), so this is enforced here, not by the DB.
        if (!await spaces.ZoneExistsInSpaceAsync(request.SpaceId, dto.ZoneId, userId, cancellationToken))
            throw new NotFoundException("Zone", dto.ZoneId);

        // Plan gate BEFORE SpacePhotoGuard and before any mutation of tracked state (T-13
        // rule 3 / B-13 D-8.2): a Free user sending a photo — valid or invalid — must get
        // 403 {plan:["photos"]}, never SpacePhotoGuard's 400. CheckAddItem checks photos
        // BEFORE items on purpose (FR-4 — see PlanPolicy's comment on the inverted
        // precedence vs. CheckNewSpace).
        var photoChange = PhotoPolicy.PhotoChangeBetween(null, dto.Photo);
        if (PlanPolicy.CheckAddItem(user.Plan, currentItems, photoChange) is { } reason)
            throw new PlanLimitException(reason);

        // Runs after the plan gate, outside any repository lock (D-4) — never scan
        // photos while holding sp_getapplock.
        SpacePhotoGuard.ThrowIfInvalid(dto.Photo, "Item.Photo");

        var entity = dto.ToEntity(request.SpaceId);
        var itemCap = PlanCaps.For(user.Plan).Items;

        logger.LogInformation("Adding item {ItemId} to space {SpaceId} zone {ZoneId} for user {UserId}", entity.Id, request.SpaceId, entity.ZoneId, userId);

        if (itemCap is int cap)
        {
            // Finite cap (Free): the pre-check above can race with concurrent adds
            // against the same space, so the actual cap is enforced atomically here
            // (D-4 — per-space sp_getapplock, shared with AddZone's insert).
            var outcome = await spaces.AddItemWithinCapAsync(entity, userId, cap, cancellationToken);
            switch (outcome)
            {
                case ContentInsertOutcome.AtCap:
                    logger.LogWarning(
                        "Item cap race lost for space {SpaceId}: concurrent add rejected at cap {Cap}", request.SpaceId, cap);
                    throw new PlanLimitException(PlanLimitReasons.Items);
                case ContentInsertOutcome.SpaceNotFound:
                    throw new NotFoundException("Space", request.SpaceId);
            }
        }
        else
        {
            // Unlimited (Pro): no lock, no serialization of concurrent adds.
            var added = await spaces.AddItemAsync(entity, userId, cancellationToken);
            if (!added) throw new NotFoundException("Space", request.SpaceId);
        }

        return ItemDto.FromEntity(entity);
    }
}
