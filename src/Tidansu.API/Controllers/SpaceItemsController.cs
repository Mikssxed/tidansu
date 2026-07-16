using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Tidansu.Application.Spaces.Commands.AddItem;
using Tidansu.Application.Spaces.Commands.RemoveItem;
using Tidansu.Application.Spaces.Commands.UpdateItem;
using Tidansu.Application.Spaces.Dtos;
using Tidansu.Models;

namespace Tidansu.API.Controllers;

[ApiController]
[Route("api/spaces/{id}/items")]
[Authorize]
public class SpaceItemsController(IMediator mediator) : ControllerBase
{
    /// <summary>Add an item to a space (enforces the photos and items/space plan caps).</summary>
    [HttpPost]
    // 8 MB (8_388_608): one max-size photo (5 MB raw / ~6.99 MB base64) + headroom for
    // the rest of the item — well under Kestrel's ~28.6 MB default, so it binds (T-20).
    [RequestSizeLimit(8 * 1024 * 1024)]
    [ProducesResponseType<ApiOperationResult<ItemDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status413PayloadTooLarge)]
    public async Task<Ok<ApiOperationResult<ItemDto>>> AddItem([FromRoute] string id, [FromBody] ItemDto item)
    {
        var result = await mediator.Send(new AddItemCommand { SpaceId = id, Item = item });
        return ApiOperationResult.Ok(result);
    }

    /// <summary>Update a single item (enforces the photos plan cap on a photo replace).</summary>
    [HttpPut("{itemId}")]
    [RequestSizeLimit(8 * 1024 * 1024)] // see AddItem — same rationale
    [ProducesResponseType<ApiOperationResult<ItemDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status413PayloadTooLarge)]
    public async Task<Ok<ApiOperationResult<ItemDto>>> UpdateItem([FromRoute] string id, [FromRoute] string itemId, [FromBody] ItemDto item)
    {
        var result = await mediator.Send(new UpdateItemCommand { SpaceId = id, ItemId = itemId, Item = item });
        return ApiOperationResult.Ok(result);
    }

    /// <summary>Remove an item.</summary>
    [HttpDelete("{itemId}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<NoContent> RemoveItem([FromRoute] string id, [FromRoute] string itemId)
    {
        await mediator.Send(new RemoveItemCommand { SpaceId = id, ItemId = itemId });
        return TypedResults.NoContent();
    }
}
