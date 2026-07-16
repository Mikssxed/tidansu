using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Application.Spaces.Dtos;
using Tidansu.Application.User;
using Tidansu.Domain.Constants;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Spaces.Commands.UpdateItem;

public class UpdateItemCommandHandler(
    ILogger<UpdateItemCommandHandler> logger,
    ISpacesRepository spaces,
    IUserService userService,
    IUserContext userContext) : IRequestHandler<UpdateItemCommand, ItemDto>
{
    public async Task<ItemDto> Handle(UpdateItemCommand request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;
        var user = await userService.FindByIdAsync(userId, cancellationToken)
            ?? throw new AuthenticationException("user not found");

        // Owner-scoped, tracked (D-3). null covers both "unknown id" and
        // "another user's item" — never a distinct 403 that would confirm existence.
        var item = await spaces.GetItemAsync(request.SpaceId, request.ItemId, userId, cancellationToken)
            ?? throw new NotFoundException("Item", request.ItemId);

        var dto = request.Item;

        // FR-5: if the update reassigns the item to a different zone, that zone must
        // belong to the same space (moving between *spaces* is not expressible — the
        // space is the route).
        if (dto.ZoneId != item.ZoneId
            && !await spaces.ZoneExistsInSpaceAsync(request.SpaceId, dto.ZoneId, userId, cancellationToken))
        {
            throw new NotFoundException("Zone", dto.ZoneId);
        }

        // TRAP (T-13e): read item.Photo into a local BEFORE assigning anything from the
        // DTO below. Assigning first and then comparing item.Photo (now equal to
        // dto.Photo) would always yield PhotoChange.None, silently disabling the photo
        // gate on every update.
        var existingPhoto = item.Photo;
        var photoChange = PhotoPolicy.PhotoChangeBetween(existingPhoto, dto.Photo);

        // Plan gate BEFORE SpacePhotoGuard and before any mutation of tracked state
        // (T-13 rule 3 / B-13 D-8.2): a Free user sending a photo — valid or invalid —
        // must get 403 {plan:["photos"]}, never SpacePhotoGuard's 400. No items-count
        // gate here (D-1): an update never changes the item count.
        if (PlanPolicy.CheckItemPhotoChange(user.Plan, photoChange) is { } reason)
            throw new PlanLimitException(reason);

        // Runs after the plan gate, before any mutation of `item` below.
        SpacePhotoGuard.ThrowIfInvalid(dto.Photo, "Item.Photo");

        item.Name = dto.Name;
        item.ZoneId = dto.ZoneId;
        item.Quantity = dto.Quantity;
        item.Tags = [.. dto.Tags];
        item.DateAdded = dto.DateAdded;
        item.Expiry = dto.Expiry;
        item.Photo = dto.Photo;
        item.SlotIndex = dto.SlotIndex;
        item.Depth = dto.Depth;
        item.Level = dto.Level;
        item.Icon = dto.Icon;

        logger.LogInformation("Updating item {ItemId} in space {SpaceId} zone {ZoneId} for user {UserId}", request.ItemId, request.SpaceId, item.ZoneId, userId);
        await spaces.SaveChangesAsync(cancellationToken);

        return ItemDto.FromEntity(item);
    }
}
