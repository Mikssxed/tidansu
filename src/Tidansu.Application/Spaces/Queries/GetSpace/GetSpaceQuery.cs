using MediatR;
using Tidansu.Application.Spaces.Dtos;

namespace Tidansu.Application.Spaces.Queries.GetSpace;

public class GetSpaceQuery : IRequest<SpaceDto>
{
    public required string Id { get; set; }
}
