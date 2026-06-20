using FluentEmail.Core;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
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
            var response = await emailBuilder.SendAsync();

            if (response.Successful)
            {
                logger.LogInformation("Email sent successfully to {Email}", to);
            }
            else
            {
                logger.LogError("Failed to send email to {Email}. Errors: {Errors}",
                    to, string.Join(", ", response.ErrorMessages));
            }
        }
    }
}
