using FluentValidation;

namespace Tidansu.Application.Spaces.Dtos;

// FR-2 (space-level field lengths) + wires up the nested zone/item validators so
// FluentValidation produces indexed, field-attributed keys (e.g. "Items[3].Name")
// as FR-6 requires. Field lengths mirror TidansuDbContext's Space mapping verbatim.
public class SpaceDtoValidator : AbstractValidator<SpaceDto>
{
    public SpaceDtoValidator()
    {
        RuleFor(s => s.Id).NotEmpty().MaximumLength(64);
        RuleFor(s => s.Name).NotEmpty().MaximumLength(120);
        RuleFor(s => s.Type).NotEmpty().MaximumLength(16);
        RuleFor(s => s.ViewMode).NotEmpty().MaximumLength(16);
        RuleFor(s => s.CanvasMode).NotEmpty().MaximumLength(16);

        RuleForEach(s => s.Zones).SetValidator(new ZoneDtoValidator());
        RuleForEach(s => s.Items).SetValidator(new ItemDtoValidator());
    }
}
