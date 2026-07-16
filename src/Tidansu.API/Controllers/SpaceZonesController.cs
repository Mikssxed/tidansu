using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Tidansu.Application.Spaces.Commands.AddZone;
using Tidansu.Application.Spaces.Commands.RemoveZone;
using Tidansu.Application.Spaces.Commands.UpdateZone;
using Tidansu.Application.Spaces.Dtos;
using Tidansu.Models;

namespace Tidansu.API.Controllers;

[ApiController]
[Route("api/spaces/{id}/zones")]
[Authorize]
public class SpaceZonesController(IMediator mediator) : ControllerBase
{
    /// <summary>Add a zone to a space (enforces the zones/space plan cap).</summary>
    // 64 KB on the write routes: a zone carries no photo, so this is generous. Set
    // explicitly rather than omitted (security review S-L1) — no attribute means
    // Kestrel's ~28.6 MB default, not "small".
    [HttpPost]
    [RequestSizeLimit(64 * 1024)]
    [ProducesResponseType<ApiOperationResult<ZoneDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<Ok<ApiOperationResult<ZoneDto>>> AddZone([FromRoute] string id, [FromBody] ZoneDto zone)
    {
        var result = await mediator.Send(new AddZoneCommand { SpaceId = id, Zone = zone });
        return ApiOperationResult.Ok(result);
    }

    /// <summary>Update a single zone.</summary>
    [HttpPut("{zoneId}")]
    [RequestSizeLimit(64 * 1024)]
    [ProducesResponseType<ApiOperationResult<ZoneDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<Ok<ApiOperationResult<ZoneDto>>> UpdateZone([FromRoute] string id, [FromRoute] string zoneId, [FromBody] ZoneDto zone)
    {
        var result = await mediator.Send(new UpdateZoneCommand { SpaceId = id, ZoneId = zoneId, Zone = zone });
        return ApiOperationResult.Ok(result);
    }

    /// <summary>Remove a zone (cascades to its items — FR-3).</summary>
    [HttpDelete("{zoneId}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<NoContent> RemoveZone([FromRoute] string id, [FromRoute] string zoneId)
    {
        await mediator.Send(new RemoveZoneCommand { SpaceId = id, ZoneId = zoneId });
        return TypedResults.NoContent();
    }
}
