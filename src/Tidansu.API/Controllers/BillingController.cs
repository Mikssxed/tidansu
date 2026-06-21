using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Tidansu.Application.Billing.Commands.HandleStripeWebhook;

namespace Tidansu.API.Controllers;

[ApiController]
[Route("api/billing")]
[AllowAnonymous]
public class BillingController(IMediator mediator) : ControllerBase
{
    /// <summary>Stripe webhook receiver (no-op until Stripe is configured).</summary>
    [HttpPost("webhook")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Webhook()
    {
        using var reader = new StreamReader(Request.Body);
        var payload = await reader.ReadToEndAsync();
        var signature = Request.Headers["Stripe-Signature"].ToString();

        await mediator.Send(new HandleStripeWebhookCommand { Payload = payload, Signature = signature });
        return Ok();
    }
}
