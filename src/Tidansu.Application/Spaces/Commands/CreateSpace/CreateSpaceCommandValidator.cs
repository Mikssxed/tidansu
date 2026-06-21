using FluentValidation;

namespace Tidansu.Application.Spaces.Commands.CreateSpace;

public class CreateSpaceCommandValidator : AbstractValidator<CreateSpaceCommand>
{
    public CreateSpaceCommandValidator()
    {
        RuleFor(c => c.Space).NotNull();
        When(c => c.Space is not null, () =>
        {
            RuleFor(c => c.Space.Id).NotEmpty().MaximumLength(64);
            RuleFor(c => c.Space.Name).NotEmpty().MaximumLength(120);
            RuleFor(c => c.Space.Type).NotEmpty();
        });
    }
}
