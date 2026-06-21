using MediatR;

namespace Tidansu.Application.Spaces.Commands.DeleteSpace;

public class DeleteSpaceCommand : IRequest
{
    public required string Id { get; set; }
}
