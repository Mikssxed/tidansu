using Microsoft.AspNetCore.Identity;
using Tidansu.Domain.Enums;

namespace Tidansu.Domain.Entities;

public class User : IdentityUser
{
    // Display name derived from the email local-part on first sign-in (Phase 12 auth).
    public string? DisplayName { get; set; }

    // Plan + sync mirror the frontend session shape (data/types.ts: Plan = 'free' | 'pro').
    public Plan Plan { get; set; } = Plan.Free;
    public bool SyncOn { get; set; }

    public List<RefreshToken> RefreshTokens { get; set; } = [];
}
