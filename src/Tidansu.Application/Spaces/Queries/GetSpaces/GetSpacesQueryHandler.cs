using MediatR;
using Tidansu.Application.Common;
using Tidansu.Application.Spaces.Dtos;
using Tidansu.Application.User;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Spaces.Queries.GetSpaces;

public class GetSpacesQueryHandler(
    ISpacesRepository spaces,
    IUserContext userContext) : IRequestHandler<GetSpacesQuery, PagedResult<SpaceSummaryDto>>
{
    public async Task<PagedResult<SpaceSummaryDto>> Handle(GetSpacesQuery request, CancellationToken cancellationToken)
    {
        var userId = userContext.GetCurrentUser().Id;
        var skip = (request.Page - 1) * request.PageSize;

        // Owner-scope is enforced inside the repo (Where(s => s.UserId == userId)) —
        // kept there, not re-checked here.
        var summaries = await spaces.GetSpaceSummariesPageAsync(userId, skip, request.PageSize, cancellationToken);
        var totalCount = await spaces.CountByUserAsync(userId, cancellationToken);

        return new PagedResult<SpaceSummaryDto>
        {
            Items = [.. summaries.Select(SpaceSummaryDto.FromSummary)],
            Page = request.Page,
            PageSize = request.PageSize,
            TotalCount = totalCount,
        };
    }
}
