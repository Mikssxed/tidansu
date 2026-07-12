namespace Tidansu.Application.Account.Dtos;

// Plan change outcome: the refreshed account, plus a checkout URL when the change
// requires payment (Stripe upgrade). Null URL → the plan was applied directly.
public class ChangePlanResult
{
    public AccountDto Account { get; set; } = null!;
    public string? CheckoutUrl { get; set; }

    // End-of-period cancel (FR-9): the account stays Pro until ProAccessUntil; the
    // frontend must show this instead of flipping to Free immediately.
    public bool CancellationScheduled { get; set; }
    public DateTimeOffset? ProAccessUntil { get; set; }
}
