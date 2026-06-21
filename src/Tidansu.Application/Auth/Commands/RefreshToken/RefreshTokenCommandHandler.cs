using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Application.Auth.Dtos;
using Tidansu.Domain.Entities;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces;
using Tidansu.Domain.Repositories;
using DomainRefreshToken = Tidansu.Domain.Entities.RefreshToken;

namespace Tidansu.Application.Auth.Commands.RefreshToken;

public class RefreshTokenCommandHandler(
    ILogger<RefreshTokenCommandHandler> logger,
    IJwtService jwtService,
    IRefreshTokensRepository refreshTokens) : IRequestHandler<RefreshTokenCommand, AuthResponse>
{
    public async Task<AuthResponse> Handle(RefreshTokenCommand request, CancellationToken cancellationToken)
    {
        var existing = await refreshTokens.GetByHashAsync(jwtService.HashRefreshToken(request.RefreshToken), cancellationToken);
        if (existing is null || !existing.IsActive)
        {
            throw new AuthenticationException("the refresh token is invalid or has expired");
        }

        var user = existing.User;
        logger.LogInformation("Rotating refresh token for user {UserId}", user.Id);

        // Rotate: revoke the presented token and issue a fresh pair.
        existing.RevokedAt = DateTime.UtcNow;

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
}
