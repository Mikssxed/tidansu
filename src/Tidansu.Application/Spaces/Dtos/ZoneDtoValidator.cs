using FluentValidation;

namespace Tidansu.Application.Spaces.Dtos;

// FR-1 — field-length parity with TidansuDbContext's Zone mapping. Copy those
// numbers verbatim, do not tighten or loosen them.
public class ZoneDtoValidator : AbstractValidator<ZoneDto>
{
    public ZoneDtoValidator()
    {
        RuleFor(z => z.Id).NotEmpty().MaximumLength(64);
        RuleFor(z => z.Label).MaximumLength(120); // string? — MaximumLength skips nulls.
        RuleFor(z => z.Color).NotEmpty().MaximumLength(16);
        RuleFor(z => z.Kind).NotEmpty().MaximumLength(16);
        RuleFor(z => z.Facing).NotEmpty().MaximumLength(16);

        When(z => z.Rect is not null, () =>
        {
            RuleFor(z => z.Rect!).SetValidator(new RectDtoValidator());
        });
    }
}
