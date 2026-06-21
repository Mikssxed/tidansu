using MediatR;
using Tidansu.Application.Account.Dtos;

namespace Tidansu.Application.Account.Commands.SetSync;

public class SetSyncCommand : IRequest<AccountDto>
{
    public bool SyncOn { get; set; }
}
