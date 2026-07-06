namespace Tidansu.Domain.Constants;

// Paywall reasons shared with the frontend PaywallReason union. Returned by
// PlanPolicy and carried on PlanLimitException so the client opens the matching
// paywall. Caps themselves live in PlanCaps; the decision lives in PlanPolicy.
public static class PlanLimitReasons
{
    public const string Spaces = "spaces";
    public const string Zones = "zones";
    public const string Items = "items";
    public const string Photos = "photos";
    public const string Sync = "sync";
}
