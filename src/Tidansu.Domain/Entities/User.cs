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

    // Stripe billing state. All nullable/defaulted so existing rows migrate cleanly.
    // Ids map later subscription lifecycle events back to this account (never by email);
    // CurrentPeriodEnd/CancelAtPeriodEnd drive the end-of-period cancel UX.
    public string? StripeCustomerId { get; set; }
    public string? StripeSubscriptionId { get; set; }
    public DateTimeOffset? CurrentPeriodEnd { get; set; }
    public bool CancelAtPeriodEnd { get; set; }

    public List<RefreshToken> RefreshTokens { get; set; } = [];
}
