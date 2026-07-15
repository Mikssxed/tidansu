namespace Tidansu.Domain.Constants;

// Structural bounds on an item's own content, independent of plan. Unlike PlanCaps
// these are the same for Free and Pro — they exist to bound the payload, not to gate
// a feature, so exceeding one is a 400 (validation), never a 403 (paywall). No DB
// column mirrors them: the tag list is serialized, so these are the only limit.
public static class ItemCaps
{
    public const int MaxTags = 15;
    public const int MaxTagLength = 24;
}
