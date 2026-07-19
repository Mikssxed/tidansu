using MediatR;
using Tidansu.Application.Common;
using Tidansu.Application.Spaces.Dtos;

namespace Tidansu.Application.Spaces.Queries.GetSpaces;

public class GetSpacesQuery : IRequest<PagedResult<SpaceSummaryDto>>
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}
