using FluentValidation;

namespace Tidansu.Application.Spaces.Commands.RemoveZone;

public class RemoveZoneCommandValidator : AbstractValidator<RemoveZoneCommand>
{
    public RemoveZoneCommandValidator()
    {
        RuleFor(c => c.SpaceId).NotEmpty();
        RuleFor(c => c.ZoneId).NotEmpty();
    }
}
