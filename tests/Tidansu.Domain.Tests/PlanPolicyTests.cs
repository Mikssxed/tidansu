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

    // ---- Per-mutation gate (B-15 / D-1) -------------------------------------------
    // CheckAddZone/CheckAddItem/CheckItemPhotoChange are the now-deleted
    // CheckSpaceMutation's `after > cap && after > before` rule decomposed
    // algebraically per mutation shape (see the derivation comment on PlanPolicy).
    // The equivalence theory that pinned this decomposition against CheckSpaceMutation
    // (n = 0..60, both plans) ran green and was removed in T-8 once CheckSpaceMutation
    // itself was deleted — keeping the old rule alive only to be tested against would
    // have been dead production code.

    [Theory]
    [InlineData(Plan.Free, 0, null)]
    [InlineData(Plan.Free, 5, null)]                       // under cap
    [InlineData(Plan.Free, 6, PlanLimitReasons.Zones)]      // at cap
    [InlineData(Plan.Free, 8, PlanLimitReasons.Zones)]      // downgraded, over cap, growing
    [InlineData(Plan.Pro, 999, null)]                       // unlimited
    public void CheckAddZone_returns_expected(Plan plan, int currentZones, string? expected)
    {
        Assert.Equal(expected, PlanPolicy.CheckAddZone(plan, currentZones));
    }

    [Theory]
    [InlineData(Plan.Free, 49, PhotoChange.None, null)]
    [InlineData(Plan.Free, 50, PhotoChange.None, PlanLimitReasons.Items)]        // at cap, no photo
    [InlineData(Plan.Free, 0, PhotoChange.Added, PlanLimitReasons.Photos)]       // well under items cap — photos still gates
    [InlineData(Plan.Free, 50, PhotoChange.Added, PlanLimitReasons.Photos)]      // both would fire — photos wins (inverted precedence)
    [InlineData(Plan.Pro, 999, PhotoChange.Added, null)]                        // unlimited, photos allowed
    public void CheckAddItem_returns_expected(Plan plan, int currentItems, PhotoChange photo, string? expected)
    {
        Assert.Equal(expected, PlanPolicy.CheckAddItem(plan, currentItems, photo));
    }

    [Theory]
    [InlineData(Plan.Free, PhotoChange.None, null)]
    [InlineData(Plan.Free, PhotoChange.Removed, null)]
    [InlineData(Plan.Free, PhotoChange.Added, PlanLimitReasons.Photos)]
    [InlineData(Plan.Free, PhotoChange.Replaced, PlanLimitReasons.Photos)]
    [InlineData(Plan.Pro, PhotoChange.None, null)]
    [InlineData(Plan.Pro, PhotoChange.Added, null)]
    [InlineData(Plan.Pro, PhotoChange.Replaced, null)]
    [InlineData(Plan.Pro, PhotoChange.Removed, null)]
    public void CheckItemPhotoChange_returns_expected(Plan plan, PhotoChange change, string? expected)
    {
        Assert.Equal(expected, PlanPolicy.CheckItemPhotoChange(plan, change));
    }

}
