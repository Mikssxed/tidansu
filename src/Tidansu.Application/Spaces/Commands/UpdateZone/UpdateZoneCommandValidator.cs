using FluentValidation;
using Tidansu.Application.Spaces.Dtos;

namespace Tidansu.Application.Spaces.Commands.UpdateZone;

public class UpdateZoneCommandValidator : AbstractValidator<UpdateZoneCommand>
{
    public UpdateZoneCommandValidator()
    {
        RuleFor(c => c.SpaceId).NotEmpty();
        RuleFor(c => c.ZoneId).NotEmpty();
        RuleFor(c => c.Zone).NotNull().SetValidator(new ZoneDtoValidator());
    }
}
