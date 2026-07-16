using MediatR;
using Tidansu.Application.Spaces.Dtos;

namespace Tidansu.Application.Spaces.Commands.AddItem;

public class AddItemCommand : IRequest<ItemDto>
{
    // From the route.
    public string SpaceId { get; set; } = null!;
    public required ItemDto Item { get; set; }
}
