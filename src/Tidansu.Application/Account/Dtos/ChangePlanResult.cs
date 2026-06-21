namespace Tidansu.Application.Account.Dtos;

// Plan change outcome: the refreshed account, plus a checkout URL when the change
// requires payment (Stripe upgrade). Null URL → the plan was applied directly.
public class ChangePlanResult
{
    public AccountDto Account { get; set; } = null!;
    public string? CheckoutUrl { get; set; }
}
