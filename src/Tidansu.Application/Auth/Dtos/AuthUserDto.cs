namespace Tidansu.Application.Auth.Dtos;

// Mirrors the frontend SessionUser shape; Plan is the lowercase literal ("free"|"pro").
public class AuthUserDto
{
    public string Email { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string Plan { get; set; } = null!;
    public bool SyncOn { get; set; }
}
