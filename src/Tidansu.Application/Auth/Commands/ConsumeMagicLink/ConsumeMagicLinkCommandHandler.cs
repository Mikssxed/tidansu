using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Application.Auth.Dtos;
using Tidansu.Domain.Entities;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces;
using Tidansu.Domain.Repositories;
using DomainRefreshToken = Tidansu.Domain.Entities.RefreshToken;

namespace Tidansu.Application.Auth.Commands.ConsumeMagicLink;

public class ConsumeMagicLinkCommandHandler(
    ILogger<ConsumeMagicLinkCommandHandler> logger,
    IJwtService jwtService,
    IUserService userService,
    IMagicLinkTokensRepository magicLinkTokens,
    IRefreshTokensRepository refreshTokens,
    ITermsAcceptancesRepository termsAcceptances) : IRequestHandler<ConsumeMagicLinkCommand, AuthResponse>
{
    public async Task<AuthResponse> Handle(ConsumeMagicLinkCommand request, CancellationToken cancellationToken)
    {
        var token = await magicLinkTokens.GetByHashAsync(jwtService.HashRefreshToken(request.Token), cancellationToken);
        if (token is null || !token.IsActive)
        {
            throw new AuthenticationException("the sign-in link is invalid or has expired");
        }

        // Single-use: burn the link before issuing tokens.
        token.ConsumedAt = DateTime.UtcNow;
        await magicLinkTokens.SaveChangesAsync(cancellationToken);

        var user = await userService.FindByEmailAsync(token.Email, cancellationToken);
        if (user is null)
        {
            logger.LogInformation("Creating account for {Email} on first magic-link sign-in", token.Email);
            user = await userService.CreateAsync(token.Email, DeriveName(token.Email), cancellationToken);
        }

        var (accessToken, refreshToken, expiresIn) = await jwtService.GenerateTokensAsync(user);
        await refreshTokens.AddAsync(new DomainRefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = jwtService.HashRefreshToken(refreshToken),
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = jwtService.GetRefreshTokenExpiry(),
        }, cancellationToken);

        await RecordTermsAcceptanceAsync(token, user.Id, cancellationToken);

        return AuthResponse.From(user, accessToken, refreshToken, expiresIn);
    }

    // Best-effort consent audit. Runs AFTER the sign-in tokens are issued and swallows any
    // failure: recording acceptance must never deny an otherwise-valid sign-in (the magic
    // link is already single-use-burned above, so a throw here would strand the user). The
    // insert is idempotent — insert-if-absent, and the repository treats the unique-index
    // collision from a concurrent double-consume as already-recorded.
    private async Task RecordTermsAcceptanceAsync(MagicLinkToken token, string userId, CancellationToken cancellationToken)
    {
        if (token.AcceptedTermsVersion is not { } version)
        {
            return;
        }

        try
        {
            if (await termsAcceptances.ExistsAsync(userId, version, cancellationToken))
            {
                return;
            }

            await termsAcceptances.AddAsync(new TermsAcceptance
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                TermsVersion = version,
                AcceptedAt = DateTime.UtcNow,
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to record terms acceptance for {UserId} version {Version}; sign-in proceeds", userId, version);
        }
    }

    // "alex.smith@x.com" -> "Alex Smith" — mirrors the frontend's nameFromEmail.
    private static string DeriveName(string email)
    {
        var local = email.Split('@')[0];
        var words = local
            .Split(['.', '_', '-', '+'], StringSplitOptions.RemoveEmptyEntries)
            .Select(w => char.ToUpperInvariant(w[0]) + w[1..]);
        var name = string.Join(' ', words);
        return string.IsNullOrWhiteSpace(name) ? "There" : name;
    }
}
