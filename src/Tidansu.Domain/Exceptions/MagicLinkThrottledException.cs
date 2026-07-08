namespace Tidansu.Domain.Exceptions;

// Raised when a recipient exceeds the per-recipient magic-link send cooldown/cap.
// The message carries only the recipient (never a token/link/secret). The API maps
// this to a generic 429 that is identical regardless of whether the account exists,
// so it can never be used to enumerate registered addresses.
public class MagicLinkThrottledException(string recipient)
    : Exception($"Too many magic-link requests for {recipient}.");
