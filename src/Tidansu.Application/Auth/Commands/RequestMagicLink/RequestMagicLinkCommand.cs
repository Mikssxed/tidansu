using MediatR;

namespace Tidansu.Application.Auth.Commands.RequestMagicLink;

public class RequestMagicLinkCommand : IRequest<RequestMagicLinkResult>
{
    public required string Email { get; set; }

    // Where the SPA should land after sign-in; baked into the emailed link.
    public string? ReturnUrl { get; set; }
}
