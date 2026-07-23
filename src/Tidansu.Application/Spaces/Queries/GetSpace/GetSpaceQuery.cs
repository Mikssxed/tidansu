using MediatR;
using Tidansu.Application.Spaces.Dtos;

namespace Tidansu.Application.Spaces.Queries.GetSpace;

public class GetSpaceQuery : IRequest<SpaceReadDto>
{
    public required string Id { get; set; }
}
