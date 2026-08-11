namespace Tidansu.Domain.Entities;

// One-time, short-lived sign-in token. Requested by email before the user may
// exist, so it carries the email rather than a User FK. Only the hash is stored.
public class MagicLinkToken
{
    public Guid Id { get; set; }
    public string Email { get; set; } = null!;
    public string TokenHash { get; set; } = null!;
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? ConsumedAt { get; set; }

    // The Terms/Privacy version the user asserted at request time (LoginView checkbox),
    // carried across the request→consume gap since the account may not exist yet.
    // Nullable so existing outstanding tokens migrate cleanly and consume stays
    // defensive if it's ever unset.
    public string? AcceptedTermsVersion { get; set; }

    public bool IsActive => ConsumedAt == null && DateTime.UtcNow < ExpiresAt;
}
