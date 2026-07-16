namespace Tidansu.Domain.Repositories;

// Outcome of a capped zone/item insert (AddZoneWithinCapAsync / AddItemWithinCapAsync).
// AddWithinSpaceCapAsync (the space-cap equivalent) returns bool because "space not
// found" cannot happen there — the space is being created. Here the space can vanish
// under a concurrent delete between ownership resolution and the locked insert, so
// three named outcomes beat an overloaded bool?.
public enum ContentInsertOutcome
{
    Inserted,
    AtCap,
    SpaceNotFound,
}
