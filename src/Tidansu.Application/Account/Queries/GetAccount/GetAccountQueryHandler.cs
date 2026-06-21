using MediatR;
using Tidansu.Application.Account.Dtos;
using Tidansu.Application.User;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Account.Queries.GetAccount;

public class GetAccountQueryHandler(
    IUserService userService,
    ISpacesRepository spaces,
    IUserContext userContext) : IRequestHandler<GetAccountQuery, AccountDto>
{
    public async Task<AccountDto> Handle(GetAccountQuery request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;
        var user = await userService.FindByIdAsync(userId, cancellationToken)
            ?? throw new AuthenticationException("user not found");

        var userSpaces = await spaces.GetAllByUserAsync(userId, cancellationToken);
        return AccountDto.From(user, UsageDto.From(userSpaces));
    }
}
