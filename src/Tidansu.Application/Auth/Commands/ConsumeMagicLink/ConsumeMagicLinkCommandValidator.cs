using FluentValidation;

namespace Tidansu.Application.Auth.Commands.ConsumeMagicLink;

public class ConsumeMagicLinkCommandValidator : AbstractValidator<ConsumeMagicLinkCommand>
{
    public ConsumeMagicLinkCommandValidator()
    {
        RuleFor(c => c.Token).NotEmpty();
    }
}
