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
    SpaceOverCapGuard overCapGuard,
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

        // B-24: is the whole space one of the account's excess spaces? Runs after both
        // not-found checks above (owner-scoping and the referenced-zone check keep
        // precedence) and BEFORE CheckAddItem/the photo gate, so `spaces` wins the
        // paywall reason when several would fire.
        await overCapGuard.EnsureSpaceContentWritableAsync(request.SpaceId, userId, cancellationToken);

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

        // In-space duplicate-id pre-check (F-6): after the 404/403/photo-guard gates
        // above, before the insert. ItemExistsInSpaceAsync is owner-scoped (D-3), so
        // this can only ever observe the caller's own space — no new existence oracle.
        // It is a check-then-insert race, not enforcement (C-5): a concurrent
        // duplicate add can still slip past into the composite-key constraint, which
        // is what the ErrorHandlingMiddleware DbUpdateException backstop is for. Do
        // not widen sp_getapplock to close that race — it would serialize every add
        // for a case that costs nothing and leaks nothing.
        if (await spaces.ItemExistsInSpaceAsync(request.SpaceId, dto.Id, userId, cancellationToken))
            throw new ValidationException(new Dictionary<string, string[]>
            {
                ["Item.Id"] = ["An item with this id already exists in this space."],
            });

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
