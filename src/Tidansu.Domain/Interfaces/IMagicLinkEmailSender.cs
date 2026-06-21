namespace Tidansu.Domain.Interfaces;

public interface IMagicLinkEmailSender
{
    /// <summary>
    /// Builds the sign-in URL for the raw token, emails it, and returns the URL in
    /// development (so the SPA can offer an "open the link" affordance) — null otherwise.
    /// </summary>
    Task<string?> SendAsync(string email, string rawToken, string? returnUrl, CancellationToken cancellationToken = default);
}
