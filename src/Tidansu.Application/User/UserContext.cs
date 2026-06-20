using System.Security.Claims;
using Microsoft.AspNetCore.Http;

namespace Tidansu.Application.User;

public interface IUserContext
{
    CurrentUser GetCurrentUser();
}

public class UserContext(IHttpContextAccessor accessor) : IUserContext
{
    public CurrentUser GetCurrentUser()
    {
        var user = accessor?.HttpContext?.User;

        if (user == null) throw new InvalidOperationException("User context is not present.");

        if (user.Identity == null || !user.Identity.IsAuthenticated) throw new InvalidOperationException("User is not authenticated.");

        var userId = user.FindFirst(c => c.Type == ClaimTypes.NameIdentifier)?.Value
            ?? throw new InvalidOperationException("User id claim is missing.");
        var username = user.FindFirst(c => c.Type == ClaimTypes.Name)?.Value ?? string.Empty;
        var email = user.FindFirst(c => c.Type == ClaimTypes.Email)?.Value ?? string.Empty;
        var roles = user.Claims.Where(c => c.Type == ClaimTypes.Role).Select(c => c.Value);

        return new CurrentUser(userId, email, roles, username);
    }
}
