namespace Tidansu.Domain.Exceptions;

// Sanitized delivery-failure signal: the message carries only the recipient,
// never the email body, magic link/token, or any provider secret.
public class EmailDeliveryException(string recipient)
    : Exception($"Failed to deliver email to {recipient}.");
