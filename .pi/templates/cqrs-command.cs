// Template: CQRS Command
// Location: Tidansu.Application/{Feature}/Commands/{ActionName}/{ActionName}Command.cs
// Replace {Feature}, {ActionName}, {ReturnType} placeholders

using MediatR;

namespace Tidansu.Application.{Feature}.Commands.{ActionName};

public class {ActionName}Command : IRequest<Guid>
// Options:
//   IRequest<Guid>          — returns entity ID
//   IRequest<{Name}Response> — returns a DTO
//   IRequest               — no return value (void-like)
{
    // Required string properties
    public required string Title { get; set; }
    public required string Description { get; set; }

    // Optional properties with defaults
    public int Exp { get; set; } = 0;

    // Enum property from Domain/Constants/
    // public {EnumType} Attribute { get; set; }

    // Collection property
    // public List<string> Tags { get; set; } = [];
}
