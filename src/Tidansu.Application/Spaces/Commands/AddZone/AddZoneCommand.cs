using MediatR;
using Tidansu.Application.Spaces.Dtos;

namespace Tidansu.Application.Spaces.Commands.AddZone;

public class AddZoneCommand : IRequest<ZoneDto>
{
    // From the route.
    public string SpaceId { get; set; } = null!;
    public required ZoneDto Zone { get; set; }
}
