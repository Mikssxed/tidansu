using MediatR;
using Tidansu.Application.Account.Dtos;

namespace Tidansu.Application.Account.Queries.GetAccount;

public class GetAccountQuery : IRequest<AccountDto>;
