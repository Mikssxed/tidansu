using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Tidansu.Application.Plans.Dtos;
using Tidansu.Application.Plans.Queries.GetPlans;
using Tidansu.Models;

namespace Tidansu.API.Controllers;

[ApiController]
[Route("api/plans")]
[AllowAnonymous]
public class PlansController(IMediator mediator) : ControllerBase
{
    /// <summary>Enforced caps for every plan (public — feeds pricing + client pre-checks).</summary>
    [HttpGet]
    [ProducesResponseType<ApiOperationResult<List<PlanCapsDto>>>(StatusCodes.Status200OK)]
    public async Task<Ok<ApiOperationResult<List<PlanCapsDto>>>> GetPlans()
    {
        var result = await mediator.Send(new GetPlansQuery());
        return ApiOperationResult.Ok(result);
    }
}
