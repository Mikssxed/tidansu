using FluentValidation;

namespace Tidansu.Application.Spaces.Commands.UpdateSpace;

public class UpdateSpaceCommandValidator : AbstractValidator<UpdateSpaceCommand>
{
    public UpdateSpaceCommandValidator()
    {
        RuleFor(c => c.Id).NotEmpty();
        RuleFor(c => c.Space).NotNull();
        When(c => c.Space is not null, () =>
        {
            RuleFor(c => c.Space.Name).NotEmpty().MaximumLength(120);
            RuleFor(c => c.Space.Type).NotEmpty();
        });
    }
}
