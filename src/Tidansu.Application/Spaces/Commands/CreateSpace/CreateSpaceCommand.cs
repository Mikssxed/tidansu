using MediatR;
using Tidansu.Application.Spaces.Dtos;

namespace Tidansu.Application.Spaces.Commands.CreateSpace;

public class CreateSpaceCommand : IRequest<SpaceReadDto>
{
    public required SpaceDto Space { get; set; }
}
