namespace Tidansu.Domain.Exceptions;

// Raised when an upgrade is attempted while billing is deliberately off or
// misconfigured, so the app returns a clear "billing unavailable" outcome and never a
// silent free Pro. Carries no config detail (message is safe to surface).
public class BillingUnavailableException()
    : Exception("Billing is currently unavailable.");
