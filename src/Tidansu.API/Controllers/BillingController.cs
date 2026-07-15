using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Tidansu.Application.Billing.Commands.HandleStripeWebhook;
using Tidansu.Extensions;

namespace Tidansu.API.Controllers;

[ApiController]
[Route("api/billing")]
[AllowAnonymous]
public class BillingController(IMediator mediator) : ControllerBase
{
    /// <summary>Stripe webhook receiver (no-op until Stripe is configured).</summary>
    [HttpPost("webhook")]
    [RequestSizeLimit(512 * 1024)] // 524288 bytes — comfortably fits real Stripe event payloads
    [EnableRateLimiting(WebApplicationBuilderExtensions.WebhookRateLimitPolicy)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status413PayloadTooLarge)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> Webhook()
    {
        using var reader = new StreamReader(Request.Body);
        var payload = await reader.ReadToEndAsync();
        var signature = Request.Headers["Stripe-Signature"].ToString();

        await mediator.Send(new HandleStripeWebhookCommand { Payload = payload, Signature = signature });
        return Ok();
    }
}
