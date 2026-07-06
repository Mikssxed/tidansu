using MediatR;
using Tidansu.Application.Plans.Dtos;
using Tidansu.Domain.Enums;

namespace Tidansu.Application.Plans.Queries.GetPlans;

public class GetPlansQueryHandler : IRequestHandler<GetPlansQuery, List<PlanCapsDto>>
{
    public Task<List<PlanCapsDto>> Handle(GetPlansQuery request, CancellationToken cancellationToken)
        => Task.FromResult(Enum.GetValues<Plan>().Select(PlanCapsDto.From).ToList());
}
