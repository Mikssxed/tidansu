using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Domain.Entities;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Auth.Commands.RequestMagicLink;

public class RequestMagicLinkCommandHandler(
    ILogger<RequestMagicLinkCommandHandler> logger,
    IJwtService jwtService,
    IMagicLinkTokensRepository magicLinkTokens,
    IMagicLinkThrottle throttle,
    IMagicLinkEmailSender emailSender) : IRequestHandler<RequestMagicLinkCommand, RequestMagicLinkResult>
{
    // Short-lived, single-use sign-in link.
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(15);

    public async Task<RequestMagicLinkResult> Handle(RequestMagicLinkCommand request, CancellationToken cancellationToken)
    {
        var email = request.Email.Trim().ToLowerInvariant();

        // Per-recipient throttle: refuse before any token/DB/send work so the same
        // address can't be mailbombed across many IPs or drain the provider quota.
        // The decision ignores account existence, so the 429 can't enumerate users.
        if (!throttle.TryRegisterSend(email))
        {
            logger.LogWarning("Magic-link request throttled for {Email}", email);
            throw new MagicLinkThrottledException(email);
        }

        logger.LogInformation("Issuing magic link for {Email}", email);

        // Supersede any links already outstanding for this email.
        await magicLinkTokens.InvalidateActiveForEmailAsync(email, cancellationToken);

        var rawToken = await jwtService.GenerateRefreshTokenAsync();
        var now = DateTime.UtcNow;
        await magicLinkTokens.AddAsync(new MagicLinkToken
        {
            Id = Guid.NewGuid(),
            Email = email,
            TokenHash = jwtService.HashRefreshToken(rawToken),
            CreatedAt = now,
            ExpiresAt = now.Add(Lifetime),
        }, cancellationToken);

        var devLink = await emailSender.SendAsync(email, rawToken, request.ReturnUrl, cancellationToken);

        return new RequestMagicLinkResult { DevLink = devLink };
    }
}
