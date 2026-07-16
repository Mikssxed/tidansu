using MediatR;
using Tidansu.Application.Spaces.Dtos;

namespace Tidansu.Application.Spaces.Commands.UpdateItem;

public class UpdateItemCommand : IRequest<ItemDto>
{
    // From the route.
    public string SpaceId { get; set; } = null!;
    public string ItemId { get; set; } = null!;
    public required ItemDto Item { get; set; }
}
