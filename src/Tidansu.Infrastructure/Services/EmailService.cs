using FluentEmail.Core;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces;

namespace Tidansu.Infrastructure.Services;

public class EmailService(
    ILogger<EmailService> logger,
    IWebHostEnvironment environment,
    IFluentEmail fluentEmail) : IEmailService
{
    public async Task SendEmailAsync(string to, string subject, string htmlBody)
    {
        logger.LogInformation("Sending email to {Email}", to);

        var emailBuilder = fluentEmail
            .To(to)
            .Subject(subject)
            .Body(htmlBody, isHtml: true);

        if (environment.IsDevelopment())
        {
            // In development save the email to a file instead of sending over SMTP.
            var emailsDir = Path.Combine(environment.ContentRootPath, "DevelopmentEmails");
            Directory.CreateDirectory(emailsDir);

            var fileName = $"Email_{to.Replace("@", "_").Replace(".", "_")}_{DateTime.Now:yyyyMMdd_HHmmss}.html";
            var filePath = Path.Combine(emailsDir, fileName);

            await File.WriteAllTextAsync(filePath, emailBuilder.Data.Body);

            logger.LogInformation("Development mode: Email saved to {FilePath}", filePath);
            logger.LogInformation("Open in browser: file:///{FilePath}", filePath.Replace("\\", "/"));
        }
        else
        {
            FluentEmail.Core.Models.SendResponse response;
            try
            {
                response = await emailBuilder.SendAsync();
            }
            catch (Exception ex)
            {
                // Log the recipient and the exception type/message only — never the
                // email body, the magic link/token, or any SMTP credential.
                logger.LogError("Failed to send email to {Email}. Reason: {Reason}",
                    to, ex.Message);
                throw new EmailDeliveryException(to);
            }

            if (!response.Successful)
            {
                // response.ErrorMessages carries provider error text only (never the
                // body or link); safe to log alongside the recipient.
                logger.LogError("Failed to send email to {Email}. Errors: {Errors}",
                    to, string.Join(", ", response.ErrorMessages));
                throw new EmailDeliveryException(to);
            }

            logger.LogInformation("Email sent successfully to {Email}", to);
        }
    }
}
