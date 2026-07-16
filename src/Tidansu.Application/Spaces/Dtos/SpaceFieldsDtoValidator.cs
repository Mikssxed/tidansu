using FluentValidation;

namespace Tidansu.Application.Spaces.Dtos;

// Mirrors SpaceDtoValidator's scalar rules verbatim (field lengths match
// TidansuDbContext's Space mapping) — minus the Id rule, which SpaceDtoValidator
// carries for the whole-space body but which has no place here: the id is on the
// route (PUT /api/spaces/{id}/fields), not in this body.
public class SpaceFieldsDtoValidator : AbstractValidator<SpaceFieldsDto>
{
    public SpaceFieldsDtoValidator()
    {
        RuleFor(s => s.Name).NotEmpty().MaximumLength(120);
        RuleFor(s => s.Type).NotEmpty().MaximumLength(16);
        RuleFor(s => s.ViewMode).NotEmpty().MaximumLength(16);
        RuleFor(s => s.CanvasMode).NotEmpty().MaximumLength(16);
    }
}
