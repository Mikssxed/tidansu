using Microsoft.AspNetCore.Identity;

namespace Tidansu.Domain.Entities;

// Foundation user — Phase 12 extends this with Plan + SyncOn and the magic-link flow.
public class User : IdentityUser
{
    public List<RefreshToken> RefreshTokens { get; set; } = [];
}
