using FluentValidation;
using Tidansu.Application.Spaces.Dtos;

namespace Tidansu.Application.Spaces.Commands.UpdateSpaceFields;

public class UpdateSpaceFieldsCommandValidator : AbstractValidator<UpdateSpaceFieldsCommand>
{
    public UpdateSpaceFieldsCommandValidator()
    {
        RuleFor(c => c.Id).NotEmpty();
        RuleFor(c => c.Fields).NotNull().SetValidator(new SpaceFieldsDtoValidator());
    }
}
