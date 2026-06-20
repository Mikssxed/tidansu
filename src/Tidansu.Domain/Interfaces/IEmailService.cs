namespace Tidansu.Domain.Interfaces;

public interface IEmailService
{
    /// <summary>
    /// Sends an HTML email. In development the message is written to a file under
    /// DevelopmentEmails/ instead of being delivered over SMTP.
    /// </summary>
    Task SendEmailAsync(string to, string subject, string htmlBody);
}
