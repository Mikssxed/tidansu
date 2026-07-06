using MediatR;
using Tidansu.Application.Plans.Dtos;

namespace Tidansu.Application.Plans.Queries.GetPlans;

// Caps for every plan (anonymous — feeds the public pricing page and client-side
// pre-mutate checks). Read-only, no user context.
public class GetPlansQuery : IRequest<List<PlanCapsDto>>;
