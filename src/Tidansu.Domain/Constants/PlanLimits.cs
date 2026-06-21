using Tidansu.Domain.Enums;

namespace Tidansu.Domain.Constants;

// Free-plan caps (Pro is unlimited + photos). Mirrors data/plans.ts.
public static class PlanLimits
{
    public const int FreeSpaces = 2;
    public const int FreeZonesPerSpace = 6;
    public const int FreeItemsPerSpace = 50;

    public static bool IsPro(Plan plan) => plan == Plan.Pro;
    public static bool AllowsPhotos(Plan plan) => plan == Plan.Pro;
}

// Paywall reasons shared with the frontend PaywallReason union.
public static class PlanLimitReasons
{
    public const string Spaces = "spaces";
    public const string Zones = "zones";
    public const string Items = "items";
    public const string Photos = "photos";
    public const string Sync = "sync";
}
