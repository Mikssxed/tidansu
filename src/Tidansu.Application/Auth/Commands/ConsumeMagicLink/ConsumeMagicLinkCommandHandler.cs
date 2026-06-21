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
    IRefreshTokensRepository refreshTokens) : IRequestHandler<ConsumeMagicLinkCommand, AuthResponse>
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

        return AuthResponse.From(user, accessToken, refreshToken, expiresIn);
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
