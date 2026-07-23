using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Tidansu.Application.Common;
using Tidansu.Application.Spaces.Commands.CreateSpace;
using Tidansu.Application.Spaces.Commands.DeleteSpace;
using Tidansu.Application.Spaces.Commands.UpdateSpaceFields;
using Tidansu.Application.Spaces.Dtos;
using Tidansu.Application.Spaces.Queries.GetSpace;
using Tidansu.Application.Spaces.Queries.GetSpaces;
using Tidansu.Extensions;
using Tidansu.Models;

namespace Tidansu.API.Controllers;

[ApiController]
[Route("api/spaces")]
[Authorize]
public class SpacesController(IMediator mediator) : ControllerBase
{
    /// <summary>A page of the current user's space summaries — no zones, items or photos.</summary>
    [HttpGet]
    [ProducesResponseType<ApiOperationResult<PagedResult<SpaceSummaryDto>>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<Ok<ApiOperationResult<PagedResult<SpaceSummaryDto>>>> GetSpaces([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var result = await mediator.Send(new GetSpacesQuery { Page = page, PageSize = pageSize });
        return ApiOperationResult.Ok(result);
    }

    /// <summary>A single space by id.</summary>
    [HttpGet("{id}")]
    [ProducesResponseType<ApiOperationResult<SpaceReadDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<Ok<ApiOperationResult<SpaceReadDto>>> GetSpace([FromRoute] string id)
    {
        var result = await mediator.Send(new GetSpaceQuery { Id = id });
        return ApiOperationResult.Ok(result);
    }

    /// <summary>Create a space (enforces the plan's space/zone/item/photo caps).</summary>
    [HttpPost]
    // 24 MB (25_165_824): ~3 max-size photos (5 MB raw / ~6.99 MB base64 each) + headroom
    // for the rest of the graph; below Kestrel's ~28.6 MB default so it's the binding
    // constraint. Because saves are whole-graph replaces, this also caps photographed
    // items per space at ~3 until B-16 moves photos off-row (B-13 D-9).
    [RequestSizeLimit(24 * 1024 * 1024)]
    // Per-account fixed window (B-23 FR-4) — space creation has no plan cap on Pro, so it
    // must still be metered to bound abuse independent of the id fix.
    [EnableRateLimiting(WebApplicationBuilderExtensions.SpaceCreateRateLimitPolicy)]
    [ProducesResponseType<ApiOperationResult<SpaceReadDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status413PayloadTooLarge)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<Ok<ApiOperationResult<SpaceReadDto>>> CreateSpace([FromBody] SpaceDto space)
    {
        var result = await mediator.Send(new CreateSpaceCommand { Space = space });
        return ApiOperationResult.Ok(result);
    }

    /// <summary>Update a space's scalar fields only (no zones/items) — see D-6/FR-7.</summary>
    // 64 KB: this body is six scalar fields and carries no photo, so the ceiling is
    // generous. It is set explicitly rather than left off (security review S-L1) —
    // omitting it does NOT mean "small", it means Kestrel's ~28.6 MB default, which is a
    // *larger* ceiling than the 24 MB whole-space PUT this endpoint replaced. An absent
    // limit on a body this small is a free DoS surface.
    [HttpPut("{id}/fields")]
    [RequestSizeLimit(64 * 1024)]
    [ProducesResponseType<ApiOperationResult<SpaceFieldsDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status413PayloadTooLarge)]
    public async Task<Ok<ApiOperationResult<SpaceFieldsDto>>> UpdateSpaceFields([FromRoute] string id, [FromBody] SpaceFieldsDto fields)
    {
        var result = await mediator.Send(new UpdateSpaceFieldsCommand { Id = id, Fields = fields });
        return ApiOperationResult.Ok(result);
    }

    /// <summary>Delete a space and its zones + items.</summary>
    [HttpDelete("{id}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<NoContent> DeleteSpace([FromRoute] string id)
    {
        await mediator.Send(new DeleteSpaceCommand { Id = id });
        return TypedResults.NoContent();
    }
}
