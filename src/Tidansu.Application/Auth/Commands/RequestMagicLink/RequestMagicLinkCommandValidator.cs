using FluentValidation;
using Tidansu.Domain.Constants;

namespace Tidansu.Application.Auth.Commands.RequestMagicLink;

public class RequestMagicLinkCommandValidator : AbstractValidator<RequestMagicLinkCommand>
{
    public RequestMagicLinkCommandValidator()
    {
        RuleFor(c => c.Email)
            .NotEmpty()
            .EmailAddress()
            .MaximumLength(256);

        // Only a real, current version can ever enter the audit record — this fires
        // before any user lookup, so a bad/missing version 400s identically regardless
        // of whether the email maps to an account (no enumeration vector).
        RuleFor(c => c.AcceptedTermsVersion)
            .NotEmpty()
            .Equal(TermsPolicy.CurrentTermsVersion);
    }
}
