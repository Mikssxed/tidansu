using FluentValidation;
using Tidansu.Application.Spaces.Dtos;

namespace Tidansu.Application.Spaces.Commands.UpdateSpace;

public class UpdateSpaceCommandValidator : AbstractValidator<UpdateSpaceCommand>
{
    public UpdateSpaceCommandValidator()
    {
        RuleFor(c => c.Id).NotEmpty();
        RuleFor(c => c.Space).NotNull().SetValidator(new SpaceDtoValidator());
    }
}
