using Tidansu.Domain.Enums;

namespace Tidansu.Domain.Constants;

// A single space's cap-relevant counts, snapshotted by the caller from a DTO or entity.
public readonly record struct SpaceUsage(int Zones, int Items, int Photos);

// The plan-limit decision, in one place. Each method returns the blocking
// PlanLimitReasons value, or null when the action is allowed. Pure and static: the
// caller throws PlanLimitException(reason). Pro's caps are unlimited (null), so its
// checks never fire — there is no per-plan special-casing here.
public static class PlanPolicy
{
    // Genesis — creating a brand-new space. Space count gates incrementally (blocked
    // once at/over cap); the submitted graph's zones/items/photos gate on their totals.
    // A new space may not be born over cap.
    public static string? CheckNewSpace(Plan plan, int currentSpaceCount, SpaceUsage space)
    {
        var caps = PlanCaps.For(plan);
        if (caps.Spaces is int spaces && currentSpaceCount >= spaces) return PlanLimitReasons.Spaces;
        if (caps.Zones is int zones && space.Zones > zones) return PlanLimitReasons.Zones;
        if (caps.Items is int items && space.Items > items) return PlanLimitReasons.Items;
        if (!caps.Photos && space.Photos > 0) return PlanLimitReasons.Photos;
        return null;
    }

    // Mutation — editing an existing space. Downgrade rule: over-cap content stays
    // editable, so a capped dimension is rejected only when the new total is both over
    // cap and higher than what is already there.
    public static string? CheckSpaceMutation(Plan plan, SpaceUsage before, SpaceUsage after)
    {
        var caps = PlanCaps.For(plan);
        if (caps.Zones is int zones && after.Zones > zones && after.Zones > before.Zones) return PlanLimitReasons.Zones;
        if (caps.Items is int items && after.Items > items && after.Items > before.Items) return PlanLimitReasons.Items;
        if (!caps.Photos && after.Photos > before.Photos) return PlanLimitReasons.Photos;
        return null;
    }
}
