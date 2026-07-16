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

    // ---- Per-mutation gate (B-15) ---------------------------------------------
    //
    // The granular item/zone endpoints have no whole-space graph in hand. The methods
    // below are not a new, independently-invented rule — they are the (now-deleted)
    // whole-space CheckSpaceMutation's `after > cap && after > before` conjunction,
    // decomposed algebraically per mutation shape. This derivation is the review
    // argument for why `currentCount >= cap` below is not a weakening of the original
    // rule (CheckSpaceMutation itself is gone — UpdateSpaceCommandHandler was its only
    // production caller and was removed in T-14; T-6's equivalence theory pinned this
    // decomposition against it, ran green, and was deleted alongside it in T-8):
    //
    //   shape        | count delta      | after > cap && after > before reduces to
    //   -------------|-------------------|------------------------------------------
    //   add one      | after = before+1 | `before+1 > cap && before+1 > before`. The
    //                |                   | right conjunct is ALWAYS true for a +1
    //                |                   | delta, so this is exactly `before >= cap`.
    //   update       | after = before   | `after > before` is ALWAYS false → never
    //                |                   | rejected — no gate call exists for this
    //                |                   | shape at all (see below).
    //   delete       | after = before-1 | `after > before` is ALWAYS false → never
    //                |                   | rejected — same as update.
    //
    // Consequence: adds gate on `currentCount >= cap` (CheckAddZone / CheckAddItem
    // below). Updates and deletes are NOT gated — there is deliberately no
    // CheckUpdateZone/CheckUpdateItem/CheckDeleteZone/CheckDeleteItem method, because
    // a shallow always-null pass-through would imply a decision exists where none
    // does. This absence is exactly what keeps a downgraded Free user (e.g. 8/6
    // zones) able to rename and delete their over-cap content: the code path that
    // could reject them simply does not exist. Applying `count >= cap` to an
    // update/delete path would reintroduce the "naive rule breaks downgraded
    // editing" bug this decomposition is designed to avoid — do not add one.
    //
    // T-6's equivalence theory pinned this derivation against CheckSpaceMutation
    // itself (n = 0..60, both plans) as the automated proof that this held, before
    // both were deleted together in T-8.

    // Add one zone to spaceId. currentZones is the space's zone count *before* the
    // add (an owner-scoped `SELECT COUNT(*)`, not a graph load). Per the derivation
    // above this is exactly CheckSpaceMutation's zones rule specialised to a +1 delta.
    public static string? CheckAddZone(Plan plan, int currentZones)
    {
        var caps = PlanCaps.For(plan);
        if (caps.Zones is int cap && currentZones >= cap) return PlanLimitReasons.Zones;
        return null;
    }

    // Whether an item's photo transition is allowed on this plan. Photos are a
    // capability, not a count (D-2): Free rejects both Added and Replaced (an
    // accepted, deliberate tightening of CheckSpaceMutation's count-delta behaviour —
    // today a downgraded Free user can swap an existing photo for a different one
    // because the count is unchanged; FR-5 closes that, "downgrade keeps data but
    // makes over-cap content read-only" extends to "writing new photo content is not
    // keeping data"). None and Removed are always allowed — removing a photo, or
    // resending an identical one (PhotoChangeBetween returns None for that case), must
    // never be blocked or a photo-bearing item becomes permanently uneditable for a
    // downgraded user.
    public static string? CheckItemPhotoChange(Plan plan, PhotoChange change)
    {
        var caps = PlanCaps.For(plan);
        if (!caps.Photos && change is PhotoChange.Added or PhotoChange.Replaced) return PlanLimitReasons.Photos;
        return null;
    }

    // Add one item to a space, with its photo transition already classified via
    // PhotoPolicy.PhotoChangeBetween. currentItems is the space's item count *before*
    // the add (an owner-scoped `SELECT COUNT(*)`, not a graph load).
    //
    // Checks photos BEFORE items — this deliberately INVERTS CheckNewSpace's
    // spaces -> zones -> items -> photos precedence. That inversion is FR-4's
    // explicit requirement (not an accident): a Free user attaching a photo to their
    // very first item (well under the items cap) must see the photos paywall, not an
    // items-cap rejection that doesn't apply. Pinned by CheckAddItem_returns_expected's
    // (Free, 50, Added) row — currentItems is at the cap, so both rules would fire, and
    // it asserts Photos wins. (That row, not the deleted T-6 equivalence theory, is what
    // guards this ordering now.)
    public static string? CheckAddItem(Plan plan, int currentItems, PhotoChange photo)
    {
        var photoReason = CheckItemPhotoChange(plan, photo);
        if (photoReason is not null) return photoReason;

        var caps = PlanCaps.For(plan);
        if (caps.Items is int cap && currentItems >= cap) return PlanLimitReasons.Items;
        return null;
    }
}
