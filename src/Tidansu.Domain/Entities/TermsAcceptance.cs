namespace Tidansu.Domain.Entities;

// A durable, per-user record of Terms of Service / Privacy Policy consent. Append-only:
// a version bump adds a new row, it never mutates or overwrites a prior acceptance, so
// the table is a full historical audit trail of who agreed, to which version, and when.
public class TermsAcceptance
{
    public Guid Id { get; set; }
    public string UserId { get; set; } = null!;
    public User User { get; set; } = null!;
    public string TermsVersion { get; set; } = null!;
    public DateTime AcceptedAt { get; set; }
}
