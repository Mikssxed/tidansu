using MediatR;

namespace Tidansu.Application.Billing.Commands.HandleStripeWebhook;

public class HandleStripeWebhookCommand : IRequest
{
    public required string Payload { get; set; }
    public required string Signature { get; set; }
}
