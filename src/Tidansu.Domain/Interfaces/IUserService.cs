using Tidansu.Domain.Entities;

namespace Tidansu.Domain.Interfaces;

// Wraps ASP.NET Identity's UserManager so Application handlers stay free of
// Infrastructure types.
public interface IUserService
{
    Task<User?> FindByEmailAsync(string email, CancellationToken cancellationToken = default);
    Task<User?> FindByIdAsync(string id, CancellationToken cancellationToken = default);
    Task<User> CreateAsync(string email, string displayName, CancellationToken cancellationToken = default);
    Task UpdateAsync(User user, CancellationToken cancellationToken = default);
}
