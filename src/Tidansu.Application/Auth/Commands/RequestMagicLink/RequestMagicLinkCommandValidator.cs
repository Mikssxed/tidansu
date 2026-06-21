using FluentValidation;

namespace Tidansu.Application.Auth.Commands.RequestMagicLink;

public class RequestMagicLinkCommandValidator : AbstractValidator<RequestMagicLinkCommand>
{
    public RequestMagicLinkCommandValidator()
    {
        RuleFor(c => c.Email)
            .NotEmpty()
            .EmailAddress()
            .MaximumLength(256);
    }
}
