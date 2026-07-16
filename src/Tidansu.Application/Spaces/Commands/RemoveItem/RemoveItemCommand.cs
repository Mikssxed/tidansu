using MediatR;

namespace Tidansu.Application.Spaces.Commands.RemoveItem;

public class RemoveItemCommand : IRequest
{
    // From the route.
    public string SpaceId { get; set; } = null!;
    public string ItemId { get; set; } = null!;
}
