using Tidansu.Domain.Entities;

namespace Tidansu.Domain.Interfaces;

public interface IJwtService
{
    Task<(string accessToken, string refreshToken, int expiresIn)> GenerateTokensAsync(User user);
    Task<string> GenerateAccessTokenAsync(User user);
    Task<string> GenerateRefreshTokenAsync();

    /// <summary>Hashes a refresh token for storage/lookup — raw tokens are never persisted.</summary>
    string HashRefreshToken(string refreshToken);

    /// <summary>UTC expiry for a refresh token issued now, based on configured lifetime.</summary>
    DateTime GetRefreshTokenExpiry();
}
