using MediatR;
using Tidansu.Application.Auth.Dtos;

namespace Tidansu.Application.Auth.Commands.ConsumeMagicLink;

public class ConsumeMagicLinkCommand : IRequest<AuthResponse>
{
    public required string Token { get; set; }
}
