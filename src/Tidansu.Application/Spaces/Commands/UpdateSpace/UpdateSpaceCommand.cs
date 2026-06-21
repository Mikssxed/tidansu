using MediatR;
using Tidansu.Application.Spaces.Dtos;

namespace Tidansu.Application.Spaces.Commands.UpdateSpace;

public class UpdateSpaceCommand : IRequest<SpaceDto>
{
    // From the route; the body carries the full space graph.
    public string Id { get; set; } = null!;
    public required SpaceDto Space { get; set; }
}
