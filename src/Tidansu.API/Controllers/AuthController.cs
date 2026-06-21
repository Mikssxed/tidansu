using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Tidansu.Application.Auth.Commands.ConsumeMagicLink;
using Tidansu.Application.Auth.Commands.RefreshToken;
using Tidansu.Application.Auth.Commands.RequestMagicLink;
using Tidansu.Application.Auth.Dtos;
using Tidansu.Extensions;
using Tidansu.Models;

namespace Tidansu.API.Controllers;

[ApiController]
[Route("api/auth")]
[AllowAnonymous]
public class AuthController(IMediator mediator) : ControllerBase
{
    /// <summary>Issue a one-time magic-link sign-in email.</summary>
    [HttpPost("magic-link")]
    [EnableRateLimiting(WebApplicationBuilderExtensions.AuthRateLimitPolicy)]
    [ProducesResponseType<ApiOperationResult<RequestMagicLinkResult>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<Ok<ApiOperationResult<RequestMagicLinkResult>>> RequestMagicLink([FromBody] RequestMagicLinkCommand command)
    {
        var result = await mediator.Send(command);
        return ApiOperationResult.Ok(result);
    }

    /// <summary>Exchange a magic-link token for JWT + refresh tokens (creating the user on first use).</summary>
    [HttpPost("consume")]
    [EnableRateLimiting(WebApplicationBuilderExtensions.AuthRateLimitPolicy)]
    [ProducesResponseType<ApiOperationResult<AuthResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<Ok<ApiOperationResult<AuthResponse>>> Consume([FromBody] ConsumeMagicLinkCommand command)
    {
        var result = await mediator.Send(command);
        return ApiOperationResult.Ok(result);
    }

    /// <summary>Rotate a refresh token for a fresh JWT + refresh pair.</summary>
    [HttpPost("refresh")]
    [EnableRateLimiting(WebApplicationBuilderExtensions.AuthRateLimitPolicy)]
    [ProducesResponseType<ApiOperationResult<AuthResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<Ok<ApiOperationResult<AuthResponse>>> Refresh([FromBody] RefreshTokenCommand command)
    {
        var result = await mediator.Send(command);
        return ApiOperationResult.Ok(result);
    }
}
