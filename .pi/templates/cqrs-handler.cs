// Template: CQRS Handler
// Works for both Command and Query handlers — adjust the base class accordingly
// Location: Tidansu.Application/{Feature}/Commands/{Name}/{Name}CommandHandler.cs
//        or Tidansu.Application/{Feature}/Queries/{Name}/{Name}QueryHandler.cs

using AutoMapper;
using MediatR;
using Microsoft.Extensions.Logging;
using Tidansu.Application.User;
using Tidansu.Domain.Entities;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces.Repositories;

namespace Tidansu.Application.{Feature}.Commands.{Name};
// or: namespace Tidansu.Application.{Feature}.Queries.{Name};

public class {Name}CommandHandler(
    ILogger<{Name}CommandHandler> logger,
    IMapper mapper,                          // Remove if no mapping needed
    I{Entity}Repository {entity}Repository,
    IUserContext userContext                  // Remove if no auth needed
) : IRequestHandler<{Name}Command, Guid>
// Options:
//   IRequestHandler<{Name}Command, Guid>
//   IRequestHandler<{Name}Command, {Name}Response>
//   IRequestHandler<{Name}Command>                  ← for void-like commands
//   IRequestHandler<{Name}Query, IEnumerable<{Entity}Dto>>
{
    public async Task<Guid> Handle({Name}Command request, CancellationToken cancellationToken)
    {
        // 1. Get current user (if needed)
        var currentUser = userContext.GetCurrentUser();
        logger.LogInformation("Handling {Name} for user {@User}", currentUser);

        // 2. Map request to entity (if using AutoMapper)
        var entity = mapper.Map<{Entity}>(request);
        entity.UserId = currentUser.Id;

        // 3. Authorization check (if needed)
        // if (entity.UserId != currentUser.Id)
        //     throw new ForbidException();

        // 4. Fetch from repository if needed (for update/delete)
        // var existing = await {entity}Repository.GetById(request.Id, currentUser.Id)
        //     ?? throw new NotFoundException(nameof({Entity}), request.Id.ToString());

        // 5. Call repository
        var id = await {entity}Repository.Create(entity);
        return id;
    }
}
