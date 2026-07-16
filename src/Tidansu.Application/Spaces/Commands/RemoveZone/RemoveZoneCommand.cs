using MediatR;

namespace Tidansu.Application.Spaces.Commands.RemoveZone;

public class RemoveZoneCommand : IRequest
{
    // From the route.
    public string SpaceId { get; set; } = null!;
    public string ZoneId { get; set; } = null!;
}
