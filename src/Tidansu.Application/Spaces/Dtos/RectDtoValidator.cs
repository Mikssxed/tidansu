using FluentValidation;

namespace Tidansu.Application.Spaces.Dtos;

// FR-9 — sanity bounds on a zone's rect. NaN/Infinity aren't valid JSON numbers, so
// System.Text.Json already rejects those at deserialisation; the real value here is
// rejecting a negative width/height before it reaches the database.
public class RectDtoValidator : AbstractValidator<RectDto>
{
    public RectDtoValidator()
    {
        RuleFor(r => r.X).Must(double.IsFinite).WithMessage("'{PropertyName}' must be a finite number.");
        RuleFor(r => r.Y).Must(double.IsFinite).WithMessage("'{PropertyName}' must be a finite number.");
        RuleFor(r => r.W)
            .Must(double.IsFinite).WithMessage("'{PropertyName}' must be a finite number.")
            .GreaterThanOrEqualTo(0);
        RuleFor(r => r.H)
            .Must(double.IsFinite).WithMessage("'{PropertyName}' must be a finite number.")
            .GreaterThanOrEqualTo(0);
    }
}
