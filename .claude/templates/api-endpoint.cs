// Template: API Controller
// Location: Tidansu.API/Controllers/{Feature}Controller.cs
// Replace {Feature}, {feature} (lowercase/kebab for route), {Name} placeholders

using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Tidansu.Application.{Feature}.Commands.Create{Feature};
using Tidansu.Application.{Feature}.Queries.Get{Feature}s;
using Tidansu.API.Models;

namespace Tidansu.API.Controllers;

[ApiController]
[Route("api/{feature}")]
[Authorize]
public class {Feature}Controller(IMediator mediator) : ControllerBase
{
    /// <summary>Create a new {feature}.</summary>
    [HttpPost]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create{Feature}([FromBody] Create{Feature}Command command)
    {
        await mediator.Send(command);
        return NoContent();
    }

    /// <summary>Get all {feature}s for the current user.</summary>
    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<Ok<ApiOperationResult<IEnumerable<{Feature}Dto>>>> Get{Feature}s()
    {
        var result = await mediator.Send(new Get{Feature}sQuery());
        return ApiOperationResult.Ok(result);
    }

    /// <summary>Get a single {feature} by ID.</summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<Ok<ApiOperationResult<{Feature}Dto>>> Get{Feature}([FromRoute] Guid id)
    {
        var result = await mediator.Send(new Get{Feature}Query { Id = id });
        return ApiOperationResult.Ok(result);
    }

    /// <summary>Delete a {feature}.</summary>
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Delete{Feature}([FromRoute] Guid id)
    {
        await mediator.Send(new Delete{Feature}Command { Id = id });
        return NoContent();
    }
}
