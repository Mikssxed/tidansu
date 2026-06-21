using MediatR;
using Tidansu.Application.Spaces.Dtos;

namespace Tidansu.Application.Spaces.Commands.CreateSpace;

public class CreateSpaceCommand : IRequest<SpaceDto>
{
    public required SpaceDto Space { get; set; }
}
