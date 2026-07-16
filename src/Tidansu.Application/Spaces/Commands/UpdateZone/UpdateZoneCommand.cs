using MediatR;
using Tidansu.Application.Spaces.Dtos;

namespace Tidansu.Application.Spaces.Commands.UpdateZone;

public class UpdateZoneCommand : IRequest<ZoneDto>
{
    // From the route.
    public string SpaceId { get; set; } = null!;
    public string ZoneId { get; set; } = null!;
    public required ZoneDto Zone { get; set; }
}
