using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Tidansu.Application.Spaces.Commands.CreateSpace;
using Tidansu.Application.Spaces.Commands.DeleteSpace;
using Tidansu.Application.Spaces.Commands.UpdateSpace;
using Tidansu.Application.Spaces.Dtos;
using Tidansu.Application.Spaces.Queries.GetSpace;
using Tidansu.Application.Spaces.Queries.GetSpaces;
using Tidansu.Models;

namespace Tidansu.API.Controllers;

[ApiController]
[Route("api/spaces")]
[Authorize]
public class SpacesController(IMediator mediator) : ControllerBase
{
    /// <summary>All spaces (with zones + items) for the current user.</summary>
    [HttpGet]
    [ProducesResponseType<ApiOperationResult<List<SpaceDto>>>(StatusCodes.Status200OK)]
    public async Task<Ok<ApiOperationResult<List<SpaceDto>>>> GetSpaces()
    {
        var result = await mediator.Send(new GetSpacesQuery());
        return ApiOperationResult.Ok(result);
    }

    /// <summary>A single space by id.</summary>
    [HttpGet("{id}")]
    [ProducesResponseType<ApiOperationResult<SpaceDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<Ok<ApiOperationResult<SpaceDto>>> GetSpace([FromRoute] string id)
    {
        var result = await mediator.Send(new GetSpaceQuery { Id = id });
        return ApiOperationResult.Ok(result);
    }

    /// <summary>Create a space (enforces the plan's space/zone/item/photo caps).</summary>
    [HttpPost]
    [ProducesResponseType<ApiOperationResult<SpaceDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<Ok<ApiOperationResult<SpaceDto>>> CreateSpace([FromBody] SpaceDto space)
    {
        var result = await mediator.Send(new CreateSpaceCommand { Space = space });
        return ApiOperationResult.Ok(result);
    }

    /// <summary>Replace a space's contents (enforces caps with the downgrade rule).</summary>
    [HttpPut("{id}")]
    [ProducesResponseType<ApiOperationResult<SpaceDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<Ok<ApiOperationResult<SpaceDto>>> UpdateSpace([FromRoute] string id, [FromBody] SpaceDto space)
    {
        var result = await mediator.Send(new UpdateSpaceCommand { Id = id, Space = space });
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
