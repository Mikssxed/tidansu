using FluentValidation;

namespace Tidansu.Application.Account.Commands.ChangePlan;

public class ChangePlanCommandValidator : AbstractValidator<ChangePlanCommand>
{
    private static readonly string[] Allowed = ["free", "pro"];

    public ChangePlanCommandValidator()
    {
        RuleFor(c => c.Plan)
            .NotEmpty()
            .Must(p => Allowed.Contains(p))
            .WithMessage("Plan must be 'free' or 'pro'.");
    }
}
