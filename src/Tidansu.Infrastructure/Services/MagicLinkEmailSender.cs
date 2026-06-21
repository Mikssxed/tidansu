using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Tidansu.Domain.Interfaces;

namespace Tidansu.Infrastructure.Services;

public class MagicLinkEmailSender(
    IEmailService emailService,
    IConfiguration configuration,
    IWebHostEnvironment environment) : IMagicLinkEmailSender
{
    public async Task<string?> SendAsync(string email, string rawToken, string? returnUrl, CancellationToken cancellationToken = default)
    {
        var baseUrl = (configuration["AppSettings:FrontendUrl"] ?? string.Empty).TrimEnd('/');
        var link = $"{baseUrl}/login?token={Uri.EscapeDataString(rawToken)}";
        if (!string.IsNullOrWhiteSpace(returnUrl))
        {
            link += $"&returnUrl={Uri.EscapeDataString(returnUrl)}";
        }

        await emailService.SendEmailAsync(email, "Your Tidansu sign-in link", BuildHtml(link));

        return environment.IsDevelopment() ? link : null;
    }

    private static string BuildHtml(string link) => $$"""
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">
          <h1 style="font-size:20px;margin:0 0 8px">Sign in to Tidansu</h1>
          <p style="font-size:14px;line-height:1.5;color:#555">
            Click the button below to sign in. This link expires in 15 minutes and can be used once.
          </p>
          <p style="margin:24px 0">
            <a href="{{link}}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600">
              Sign in to Tidansu
            </a>
          </p>
          <p style="font-size:12px;color:#888;line-height:1.5">
            If the button doesn't work, paste this URL into your browser:<br />
            <span style="word-break:break-all">{{link}}</span>
          </p>
          <p style="font-size:12px;color:#888">If you didn't request this, you can safely ignore this email.</p>
        </div>
        """;
}
