using Tidansu.Domain.Constants;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces;
using Tidansu.Domain.Repositories;

namespace Tidansu.Application.Spaces;

// B-24: the ONE shared definition of "is this whole space one of the account's
// excess spaces?", reused by every content-mutating Spaces handler. This is
// orthogonal to PlanPolicy's per-space zone/item COUNT caps (see the D-1 comment
// there) — it does not ask "does this space have too many zones/items?", it asks
// "is the space's own rank at or beyond caps.Spaces?", and unlike the count caps
// it DOES gate updates and deletes of the space's contents, because an over-cap
// space is read-only in full.
//
// Callers MUST have already owner-scoped-resolved spaceId (a 404 on unknown/other-
// user ids) before calling this — it assumes the space belongs to userId and never
// itself distinguishes "not found" from "over cap". Calling it against a space
// that isn't the caller's would turn a would-be 404 into a 403 that confirms the
// space exists (an existence oracle) — the opposite of what every other owner-
// scoped query in this codebase is built to avoid (D-3).
//
// This single-method form takes its own FindByIdAsync lookup rather than an
// overload accepting an already-resolved Plan, so AddZone/AddItem/UpdateItem (which
// already load `user` for their own photo/count gates) do a second PK lookup on
// their write path. Accepted deliberately (B-24 tech-tasks §Refactoring): every
// call site stays identical regardless of what gates a handler already runs, which
// is worth more than saving one indexed PK read. Revisit only if profiling ever
// shows this lookup mattering.
//
// B-25: the GET /api/spaces list flag (SpaceSummaryDto.IsOverCap, computed in
// GetSpacesQueryHandler) shares this class's predicate, PlanPolicy.
// CheckSpaceContentMutation, feeding it the page query's own `skip + rowIndex`
// as rank instead of a second CountSpacesOrderedBeforeAsync call (both rank
// sources walk the same collated Id order — see that method's comment). Any
// change to the over-cap rule must go through PlanPolicy.CheckSpaceContentMutation
// so enforcement here and the advertised list flag cannot diverge.
//
// B-26: GetSpaceQueryHandler (the single-space GET) is a fourth consumer, via
// IsSpaceOverCapAsync below — the same "owner-scope first" existence-oracle
// caveat above applies to it too: it must call this only after its own 404 check.
// EnsureSpaceContentWritableAsync and IsSpaceOverCapAsync share one private
// reason path (user lookup → Pro short-circuit → rank → predicate) so there is
// still exactly one implementation of "is this space over cap?".
public class SpaceOverCapGuard(IUserService userService, ISpacesRepository spaces)
{
    public async Task EnsureSpaceContentWritableAsync(string spaceId, string userId, CancellationToken cancellationToken = default)
    {
        if (await OverCapReasonAsync(spaceId, userId, cancellationToken) is { } reason)
            throw new PlanLimitException(reason);
    }

    public async Task<bool> IsSpaceOverCapAsync(string spaceId, string userId, CancellationToken cancellationToken = default) =>
        await OverCapReasonAsync(spaceId, userId, cancellationToken) is not null;

    private async Task<string?> OverCapReasonAsync(string spaceId, string userId, CancellationToken cancellationToken)
    {
        var user = await userService.FindByIdAsync(userId, cancellationToken)
            ?? throw new AuthenticationException("user not found");

        // Pro short-circuit: caps.Spaces is null, so no rank query is ever run for Pro.
        if (PlanCaps.For(user.Plan).Spaces is not int) return null;

        var preceding = await spaces.CountSpacesOrderedBeforeAsync(spaceId, userId, cancellationToken);
        return PlanPolicy.CheckSpaceContentMutation(user.Plan, preceding);
    }
}
