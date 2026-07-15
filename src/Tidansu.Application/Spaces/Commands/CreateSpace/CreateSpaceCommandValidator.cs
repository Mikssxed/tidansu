using FluentValidation;
using Tidansu.Application.Spaces.Dtos;

namespace Tidansu.Application.Spaces.Commands.CreateSpace;

public class CreateSpaceCommandValidator : AbstractValidator<CreateSpaceCommand>
{
    public CreateSpaceCommandValidator()
    {
        RuleFor(c => c.Space).NotNull().SetValidator(new SpaceDtoValidator());
    }
}
