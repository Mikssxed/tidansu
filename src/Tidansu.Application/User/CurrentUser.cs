namespace Tidansu.Application.User;

public record CurrentUser(string Id, string Email, IEnumerable<string> Roles, string Username)
{
    public bool IsInRole(string role)
    {
        return Roles.Contains(role);
    }
}
