using MediatR;
using Tidansu.Application.Spaces.Dtos;
using Tidansu.Application.User;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Spaces.Queries.GetSpace;

public class GetSpaceQueryHandler(
    ISpacesRepository spaces,
    IUserContext userContext,
    SpaceOverCapGuard overCapGuard) : IRequestHandler<GetSpaceQuery, SpaceReadDto>
{
    public async Task<SpaceReadDto> Handle(GetSpaceQuery request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;
        // Photo-less full graph (B-16 / SC-3) — GetByIdAsync stays tracked +
        // photo-bearing for DeleteSpaceCommandHandler's cascade only.
        var space = await spaces.GetLayoutByIdAsync(request.Id, userId, cancellationToken)
            ?? throw new NotFoundException("Space", request.Id);

        // B-26 S-1: the guard must only ever be called after the owner-scoped 404
        // above — calling it first would turn a would-be 404 into a 403 that
        // confirms the space exists (existence oracle), see SpaceOverCapGuard.
        var isOverCap = await overCapGuard.IsSpaceOverCapAsync(request.Id, userId, cancellationToken);
        return SpaceReadDto.FromEntity(space, isOverCap);
    }
}
