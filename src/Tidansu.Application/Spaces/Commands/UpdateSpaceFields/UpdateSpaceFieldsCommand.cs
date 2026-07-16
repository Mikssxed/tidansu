using MediatR;
using Tidansu.Application.Spaces.Dtos;

namespace Tidansu.Application.Spaces.Commands.UpdateSpaceFields;

public class UpdateSpaceFieldsCommand : IRequest<SpaceFieldsDto>
{
    // From the route; the body carries only the scalar field set (D-6/OQ-2).
    public string Id { get; set; } = null!;
    public required SpaceFieldsDto Fields { get; set; }
}
