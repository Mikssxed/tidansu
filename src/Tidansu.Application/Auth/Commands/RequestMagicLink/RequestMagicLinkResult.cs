namespace Tidansu.Application.Auth.Commands.RequestMagicLink;

public class RequestMagicLinkResult
{
    // Populated only in development so the SPA can offer "open the link" without an inbox.
    public string? DevLink { get; set; }
}
