using MediatR;
using Tidansu.Application.Auth.Dtos;

namespace Tidansu.Application.Auth.Commands.RefreshToken;

public class RefreshTokenCommand : IRequest<AuthResponse>
{
    public required string RefreshToken { get; set; }
}
