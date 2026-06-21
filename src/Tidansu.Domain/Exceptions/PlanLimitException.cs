namespace Tidansu.Domain.Exceptions;

// Thrown when a mutation would exceed the plan's cap. Reason ∈ PlanLimitReasons
// and is surfaced to the client so it can open the matching paywall.
public class PlanLimitException(string reason)
    : Exception($"Plan limit reached: {reason}.")
{
    public string Reason { get; } = reason;
}
