using FluentValidation;

namespace Tidansu.Application.Spaces.Commands.RemoveItem;

public class RemoveItemCommandValidator : AbstractValidator<RemoveItemCommand>
{
    public RemoveItemCommandValidator()
    {
        RuleFor(c => c.SpaceId).NotEmpty();
        RuleFor(c => c.ItemId).NotEmpty();
    }
}
