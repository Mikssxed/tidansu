using FluentValidation;
using Tidansu.Application.Spaces.Dtos;

namespace Tidansu.Application.Spaces.Commands.AddZone;

public class AddZoneCommandValidator : AbstractValidator<AddZoneCommand>
{
    public AddZoneCommandValidator()
    {
        RuleFor(c => c.SpaceId).NotEmpty();
        RuleFor(c => c.Zone).NotNull().SetValidator(new ZoneDtoValidator());
    }
}
