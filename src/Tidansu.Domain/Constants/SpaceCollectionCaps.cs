namespace Tidansu.Domain.Constants;

// Defence-in-depth bound on how many zones/items a single POST /api/spaces request
// may carry — independent of plan (B-22 FR-5). Unlike PlanCaps these are the SAME
// for Free and Pro: they exist to bound one request's payload size, not to gate a
// feature, so exceeding one is a SpaceDtoValidator 400, never a PlanLimitException
// 403. Set at ~100x the Free per-space caps (6 zones / 50 items — see PlanCaps) so
// no legitimate Pro user can ever approach them, and ~240x below the ~120,000-zone
// single-request volume the unbounded collection previously allowed (S-4).
// Do NOT fold these into PlanCaps or let them resolve per-plan.
public static class SpaceCollectionCaps
{
    public const int ZoneCollectionMax = 500;
    public const int ItemCollectionMax = 5_000;
}
