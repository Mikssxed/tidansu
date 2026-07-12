using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Tidansu.Domain.Entities;
using Tidansu.Domain.Enums;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces;

namespace Tidansu.Infrastructure.Services;

public class UserService(UserManager<User> userManager) : IUserService
{
    public Task<User?> FindByEmailAsync(string email, CancellationToken cancellationToken = default)
        => userManager.FindByEmailAsync(email);

    public Task<User?> FindByIdAsync(string id, CancellationToken cancellationToken = default)
        => userManager.FindByIdAsync(id);

    public Task<User?> FindByStripeSubscriptionIdAsync(string subscriptionId, CancellationToken cancellationToken = default)
        => userManager.Users.FirstOrDefaultAsync(u => u.StripeSubscriptionId == subscriptionId, cancellationToken);

    public Task<User?> FindByStripeCustomerIdAsync(string customerId, CancellationToken cancellationToken = default)
        => userManager.Users.FirstOrDefaultAsync(u => u.StripeCustomerId == customerId, cancellationToken);

    public async Task<User> CreateAsync(string email, string displayName, CancellationToken cancellationToken = default)
    {
        var user = new User
        {
            Email = email,
            UserName = email,
            DisplayName = displayName,
            // Magic-link sign-in proves ownership of the inbox, so the email is confirmed.
            EmailConfirmed = true,
            Plan = Plan.Free,
        };

        var result = await userManager.CreateAsync(user);
        if (!result.Succeeded)
        {
            throw new ValidationException(new Dictionary<string, string[]>
            {
                ["email"] = result.Errors.Select(e => e.Description).ToArray(),
            });
        }

        return user;
    }

    public async Task UpdateAsync(User user, CancellationToken cancellationToken = default)
    {
        var result = await userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            throw new ValidationException(new Dictionary<string, string[]>
            {
                ["user"] = result.Errors.Select(e => e.Description).ToArray(),
            });
        }
    }
}
