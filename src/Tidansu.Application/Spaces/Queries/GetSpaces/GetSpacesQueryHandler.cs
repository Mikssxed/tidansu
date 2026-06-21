using MediatR;
using Tidansu.Application.Spaces.Dtos;
using Tidansu.Application.User;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Spaces.Queries.GetSpaces;

public class GetSpacesQueryHandler(
    ISpacesRepository spaces,
    IUserContext userContext) : IRequestHandler<GetSpacesQuery, List<SpaceDto>>
{
    public async Task<List<SpaceDto>> Handle(GetSpacesQuery request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;
        var entities = await spaces.GetAllByUserAsync(userId, cancellationToken);
        return [.. entities.Select(SpaceDto.FromEntity)];
    }
}
