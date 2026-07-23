using MediatR;
using Tidansu.Application.Common;
using Tidansu.Application.Spaces.Dtos;
using Tidansu.Application.User;
using Tidansu.Domain.Constants;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Spaces.Queries.GetSpaces;

public class GetSpacesQueryHandler(
    ISpacesRepository spaces,
    IUserContext userContext,
    IUserService userService) : IRequestHandler<GetSpacesQuery, PagedResult<SpaceSummaryDto>>
{
    public async Task<PagedResult<SpaceSummaryDto>> Handle(GetSpacesQuery request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;
        var skip = (request.Page - 1) * request.PageSize;

        var user = await userService.FindByIdAsync(userId, cancellationToken)
            ?? throw new AuthenticationException("user not found");

        // Owner-scope is enforced inside the repo (Where(s => s.UserId == userId)) —
        // kept there, not re-checked here.
        var summaries = await spaces.GetSpaceSummariesPageAsync(userId, skip, request.PageSize, cancellationToken);
        var totalCount = await spaces.CountByUserAsync(userId, cancellationToken);

        // B-25: `skip + i` is each summary's 0-based rank in the account's
        // OrderBy(Id) order, because GetSpaceSummariesPageAsync orders and skips
        // by exactly that key — the same collated Id order SpaceOverCapGuard's
        // CountSpacesOrderedBeforeAsync counts against. Reusing the page index as
        // rank (instead of a per-row CountSpacesOrderedBeforeAsync call) avoids an
        // N+1 while keeping this the SAME PlanPolicy.CheckSpaceContentMutation
        // predicate the guard enforces with (see SpaceOverCapGuard).
        return new PagedResult<SpaceSummaryDto>
        {
            Items = [.. summaries.Select((s, i) => SpaceSummaryDto.FromSummary(
                s, PlanPolicy.CheckSpaceContentMutation(user.Plan, skip + i) is not null))],
            Page = request.Page,
            PageSize = request.PageSize,
            TotalCount = totalCount,
        };
    }
}
