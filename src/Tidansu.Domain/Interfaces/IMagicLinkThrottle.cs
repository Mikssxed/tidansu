namespace Tidansu.Domain.Interfaces;

public interface IMagicLinkThrottle
{
    /// <summary>
    /// Records a magic-link send attempt for the (already normalized) recipient and
    /// returns whether it is allowed under the per-recipient cooldown and hourly cap.
    /// Returns <c>false</c> when the recipient is currently throttled — the caller must
    /// not send. The decision never depends on whether an account exists (anti-enumeration).
    /// </summary>
    bool TryRegisterSend(string normalizedEmail);
}
