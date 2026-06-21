using MediatR;
using Tidansu.Application.Account.Dtos;

namespace Tidansu.Application.Account.Commands.ChangePlan;

// "free" | "pro". Routed through the IBillingService seam (direct flip in dev,
// Stripe checkout when configured).
public class ChangePlanCommand : IRequest<ChangePlanResult>
{
    public required string Plan { get; set; }
}
