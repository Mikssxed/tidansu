using FluentValidation;
using Tidansu.Application.Spaces.Dtos;

namespace Tidansu.Application.Spaces.Commands.UpdateItem;

// Do not add a photo rule here — FluentValidation's ValidationBehavior runs before
// the handler, so a photo rule would return 400 and preempt the 403 paywall,
// inverting B-13's ordering (gate before guard). Photos are gated in the handler,
// then guarded by SpacePhotoGuard.
public class UpdateItemCommandValidator : AbstractValidator<UpdateItemCommand>
{
    public UpdateItemCommandValidator()
    {
        RuleFor(c => c.SpaceId).NotEmpty();
        RuleFor(c => c.ItemId).NotEmpty();
        RuleFor(c => c.Item).NotNull().SetValidator(new ItemDtoValidator());
    }
}
