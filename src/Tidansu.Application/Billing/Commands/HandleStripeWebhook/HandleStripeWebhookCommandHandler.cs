using MediatR;
using Tidansu.Domain.Interfaces;

namespace Tidansu.Application.Billing.Commands.HandleStripeWebhook;

public class HandleStripeWebhookCommandHandler(IBillingService billing)
    : IRequestHandler<HandleStripeWebhookCommand>
{
    public Task Handle(HandleStripeWebhookCommand request, CancellationToken cancellationToken)
        => billing.HandleWebhookAsync(request.Payload, request.Signature, cancellationToken);
}
