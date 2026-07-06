using Tidansu.Domain.Constants;
using Tidansu.Domain.Enums;
using Xunit;

namespace Tidansu.Domain.Tests;

// Pins the current plan-limit behaviour as the spec, so the extraction into PlanPolicy
// is provably behaviour-preserving. The interface is the test surface: pure inputs in,
// blocking reason (or null) out — no DB, no mocks.
public class PlanPolicyTests
{
    // ---- Genesis: creating a brand-new space -------------------------------------

    [Theory]
    // Free — space count gates incrementally (blocked at/over cap)
    [InlineData(Plan.Free, 0, 0, 0, 0, null)]                        // first space, empty
    [InlineData(Plan.Free, 1, 6, 50, 0, null)]                       // under space cap, at zone/item caps
    [InlineData(Plan.Free, 2, 0, 0, 0, PlanLimitReasons.Spaces)]     // at space cap → blocked
    [InlineData(Plan.Free, 3, 0, 0, 0, PlanLimitReasons.Spaces)]     // over space cap → blocked
    // Free — graph dimensions gate on the submitted totals (strict >)
    [InlineData(Plan.Free, 0, 6, 0, 0, null)]                        // zones exactly at cap
    [InlineData(Plan.Free, 0, 7, 0, 0, PlanLimitReasons.Zones)]      // zones over cap
    [InlineData(Plan.Free, 0, 0, 50, 0, null)]                       // items exactly at cap
    [InlineData(Plan.Free, 0, 0, 51, 0, PlanLimitReasons.Items)]     // items over cap
    [InlineData(Plan.Free, 0, 0, 0, 1, PlanLimitReasons.Photos)]     // any photo blocked on Free
    // Free — precedence order: spaces → zones → items → photos
    [InlineData(Plan.Free, 2, 7, 51, 1, PlanLimitReasons.Spaces)]
    [InlineData(Plan.Free, 0, 7, 51, 1, PlanLimitReasons.Zones)]
    [InlineData(Plan.Free, 0, 0, 51, 1, PlanLimitReasons.Items)]
    // Pro — unlimited caps, nothing fires
    [InlineData(Plan.Pro, 999, 999, 999, 999, null)]
    public void CheckNewSpace_returns_expected(Plan plan, int spaceCount, int zones, int items, int photos, string? expected)
    {
        var result = PlanPolicy.CheckNewSpace(plan, spaceCount, new SpaceUsage(zones, items, photos));
        Assert.Equal(expected, result);
    }

    // ---- Mutation: editing an existing space (downgrade rule) --------------------

    [Theory]
    // Free — within caps
    [InlineData(Plan.Free, 0, 0, 0, 0, 0, 0, null)]                  // empty → empty
    [InlineData(Plan.Free, 0, 0, 0, 6, 50, 0, null)]                 // grow up to the caps exactly
    // Free — over cap but not growing (downgrade: stays editable)
    [InlineData(Plan.Free, 8, 0, 0, 8, 0, 0, null)]                  // 8 zones stays 8
    [InlineData(Plan.Free, 8, 0, 0, 7, 0, 0, null)]                  // over-cap zones shrinking
    [InlineData(Plan.Free, 0, 60, 0, 0, 60, 0, null)]               // over-cap items unchanged
    // Free — over cap AND growing → blocked
    [InlineData(Plan.Free, 8, 0, 0, 9, 0, 0, PlanLimitReasons.Zones)]
    [InlineData(Plan.Free, 6, 0, 0, 7, 0, 0, PlanLimitReasons.Zones)]
    [InlineData(Plan.Free, 0, 60, 0, 0, 61, 0, PlanLimitReasons.Items)]
    // Free — zone growth into cap boundary is allowed at exactly cap
    [InlineData(Plan.Free, 0, 0, 0, 6, 0, 0, null)]                  // 6 is not > 6
    // Free — photos gate on delta (any increase blocked)
    [InlineData(Plan.Free, 0, 0, 0, 0, 0, 1, PlanLimitReasons.Photos)]   // 0 → 1
    [InlineData(Plan.Free, 0, 0, 1, 0, 0, 2, PlanLimitReasons.Photos)]   // 1 → 2
    [InlineData(Plan.Free, 0, 0, 2, 0, 0, 1, null)]                      // 2 → 1 (removing, allowed)
    // Free — precedence: zones before items
    [InlineData(Plan.Free, 0, 0, 0, 7, 61, 0, PlanLimitReasons.Zones)]
    // Pro — unlimited, nothing fires even when growing hugely
    [InlineData(Plan.Pro, 0, 0, 0, 999, 999, 999, null)]
    public void CheckSpaceMutation_returns_expected(
        Plan plan,
        int beforeZones, int beforeItems, int beforePhotos,
        int afterZones, int afterItems, int afterPhotos,
        string? expected)
    {
        var result = PlanPolicy.CheckSpaceMutation(
            plan,
            new SpaceUsage(beforeZones, beforeItems, beforePhotos),
            new SpaceUsage(afterZones, afterItems, afterPhotos));
        Assert.Equal(expected, result);
    }

    // ---- Caps source of truth ----------------------------------------------------

    [Fact]
    public void Free_caps_match_the_shipped_limits()
    {
        var caps = PlanCaps.For(Plan.Free);
        Assert.Equal(2, caps.Spaces);
        Assert.Equal(6, caps.Zones);
        Assert.Equal(50, caps.Items);
        Assert.False(caps.Photos);
        Assert.False(caps.Sync);
    }

    [Fact]
    public void Pro_caps_are_unlimited_and_unlock_photos_and_sync()
    {
        var caps = PlanCaps.For(Plan.Pro);
        Assert.Null(caps.Spaces);
        Assert.Null(caps.Zones);
        Assert.Null(caps.Items);
        Assert.True(caps.Photos);
        Assert.True(caps.Sync);
    }
}
