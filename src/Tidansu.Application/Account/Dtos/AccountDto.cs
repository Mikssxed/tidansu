using DomainUser = Tidansu.Domain.Entities.User;

namespace Tidansu.Application.Account.Dtos;

public class AccountDto
{
    public string Email { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string Plan { get; set; } = null!;
    public bool SyncOn { get; set; }
    public UsageDto Usage { get; set; } = new();

    public static AccountDto From(DomainUser user, UsageDto usage) => new()
    {
        Email = user.Email ?? string.Empty,
        Name = user.DisplayName ?? string.Empty,
        Plan = user.Plan.ToString().ToLowerInvariant(),
        SyncOn = user.SyncOn,
        Usage = usage,
    };
}
