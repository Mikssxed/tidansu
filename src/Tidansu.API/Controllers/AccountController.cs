using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Tidansu.Application.Account.Commands.ChangePlan;
using Tidansu.Application.Account.Commands.SetSync;
using Tidansu.Application.Account.Dtos;
using Tidansu.Application.Account.Queries.GetAccount;
using Tidansu.Models;

namespace Tidansu.API.Controllers;

[ApiController]
[Route("api/account")]
[Authorize]
public class AccountController(IMediator mediator) : ControllerBase
{
    /// <summary>Profile, plan, sync and aggregate usage for the current user.</summary>
    [HttpGet]
    [ProducesResponseType<ApiOperationResult<AccountDto>>(StatusCodes.Status200OK)]
    public async Task<Ok<ApiOperationResult<AccountDto>>> GetAccount()
    {
        var result = await mediator.Send(new GetAccountQuery());
        return ApiOperationResult.Ok(result);
    }

    /// <summary>Change the plan (free/pro). Routed through the billing seam; may
    /// return a checkout URL when payment is required (Stripe upgrade).</summary>
    [HttpPut("plan")]
    [ProducesResponseType<ApiOperationResult<ChangePlanResult>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<Ok<ApiOperationResult<ChangePlanResult>>> ChangePlan([FromBody] ChangePlanCommand command)
    {
        var result = await mediator.Send(command);
        return ApiOperationResult.Ok(result);
    }

    /// <summary>Toggle cross-device sync (Pro only; Free → 403 plan:sync).</summary>
    [HttpPut("sync")]
    [ProducesResponseType<ApiOperationResult<AccountDto>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<Ok<ApiOperationResult<AccountDto>>> SetSync([FromBody] SetSyncCommand command)
    {
        var result = await mediator.Send(command);
        return ApiOperationResult.Ok(result);
    }
}
