using MediatR;

namespace Tidansu.Application.Auth.Commands.RequestMagicLink;

public class RequestMagicLinkCommand : IRequest<RequestMagicLinkResult>
{
    public required string Email { get; set; }

    // Where the SPA should land after sign-in; baked into the emailed link.
    public string? ReturnUrl { get; set; }

    // The Terms/Privacy version the user ticked on the login form's consent checkbox.
    // Validated against TermsPolicy.CurrentTermsVersion, then carried on the issued
    // MagicLinkToken so ConsumeMagicLinkCommandHandler can record the acceptance once
    // the account is resolved/created.
    public required string AcceptedTermsVersion { get; set; }
}
