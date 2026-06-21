using DomainUser = Tidansu.Domain.Entities.User;

namespace Tidansu.Application.Auth.Dtos;

public class AuthResponse
{
    public string AccessToken { get; set; } = null!;
    public string RefreshToken { get; set; } = null!;
    public int ExpiresIn { get; set; }
    public AuthUserDto User { get; set; } = null!;

    public static AuthResponse From(DomainUser user, string accessToken, string refreshToken, int expiresIn) => new()
    {
        AccessToken = accessToken,
        RefreshToken = refreshToken,
        ExpiresIn = expiresIn,
        User = new AuthUserDto
        {
            Email = user.Email ?? string.Empty,
            Name = user.DisplayName ?? string.Empty,
            Plan = user.Plan.ToString().ToLowerInvariant(),
            SyncOn = user.SyncOn,
        },
    };
}
