using FluentValidation;

namespace Tidansu.Application.Spaces.Queries.GetSpaces;

// A bad page/pageSize is a plain 400 — no plan gate is involved, so there's no
// ordering hazard here (unlike the photo rules elsewhere in Spaces). PageSize is
// clamped to 100 server-side so a caller cannot request an unbounded page (DoS).
// Page is bounded above too: skip = (Page-1)*PageSize is an Int32, so an
// unbounded Page overflows to a negative OFFSET (SQL error / 500) — cap it well
// below the point where (Page-1)*100 can overflow.
public class GetSpacesQueryValidator : AbstractValidator<GetSpacesQuery>
{
    public GetSpacesQueryValidator()
    {
        RuleFor(q => q.Page).InclusiveBetween(1, 1_000_000);
        RuleFor(q => q.PageSize).InclusiveBetween(1, 100);
    }
}
