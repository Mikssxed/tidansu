using MediatR;
using Tidansu.Application.Spaces.Dtos;
using Tidansu.Application.User;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Spaces.Queries.GetSpace;

public class GetSpaceQueryHandler(
    ISpacesRepository spaces,
    IUserContext userContext) : IRequestHandler<GetSpaceQuery, SpaceDto>
{
    public async Task<SpaceDto> Handle(GetSpaceQuery request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;
        // Photo-less full graph (B-16 / SC-3) — GetByIdAsync stays tracked +
        // photo-bearing for DeleteSpaceCommandHandler's cascade only.
        var space = await spaces.GetLayoutByIdAsync(request.Id, userId, cancellationToken)
            ?? throw new NotFoundException("Space", request.Id);
        return SpaceDto.FromEntity(space);
    }
}
