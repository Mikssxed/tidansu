using System.Net;
using System.Net.Mail;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Tidansu.Domain.Entities;
using Tidansu.Domain.Interfaces;
using Tidansu.Domain.Repositories;
using Tidansu.Infrastructure.Persistence;
using Tidansu.Infrastructure.Repositories;
using Tidansu.Infrastructure.Services;

namespace Tidansu.Infrastructure.Extensions;

public static class ServiceCollectionExtensions
{
    public static void AddInfrastructure(this IServiceCollection services, IConfiguration configuration, IWebHostEnvironment environment)
    {
        var connectionString = configuration.GetConnectionString("TidansuDb");
        services.AddDbContext<TidansuDbContext>(options =>
        {
            options.UseSqlServer(connectionString);
            if (environment.IsDevelopment())
            {
                options.EnableSensitiveDataLogging();
            }
        });

        services.AddIdentityApiEndpoints<User>().AddRoles<IdentityRole>()
            .AddEntityFrameworkStores<TidansuDbContext>();

        services.Configure<IdentityOptions>(options =>
        {
            options.User.RequireUniqueEmail = true;
            options.Lockout.AllowedForNewUsers = true;
            options.Lockout.MaxFailedAccessAttempts = 5;
            options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
        });

        // JWT
        services.Configure<JwtSettings>(configuration.GetSection("JwtSettings"));
        services.AddScoped<IJwtService, JwtService>();

        // FluentEmail — file-based in development (see EmailService), SMTP in production.
        var smtpSettings = configuration.GetSection("SmtpSettings");
        var emailBuilder = services
            .AddFluentEmail(smtpSettings["SenderEmail"] ?? "noreply@tidansu.com", smtpSettings["SenderName"] ?? "Tidansu")
            .AddRazorRenderer();

        if (environment.IsDevelopment())
        {
            // Dev never delivers — EmailService writes to a file, so this sender is unused.
            emailBuilder.AddSmtpSender("localhost", 25);
        }
        else
        {
            // Production SMTP credentials come from environment variables
            // (SmtpSettings__Host / __Username / __Password / __Port / __EnableSsl),
            // never committed config. Fail loud at boot on any missing/invalid value —
            // never echo the value — mirroring the JwtSettings:Secret guard.
            var host = RequireSmtpSetting(smtpSettings, "Host");
            var username = RequireSmtpSetting(smtpSettings, "Username");
            var password = RequireSmtpSetting(smtpSettings, "Password");

            var portRaw = smtpSettings["Port"];
            if (!int.TryParse(portRaw, out var port))
            {
                throw new InvalidOperationException(
                    "SmtpSettings:Port is missing or not a valid integer. Set the SmtpSettings__Port environment variable.");
            }

            var enableSslRaw = smtpSettings["EnableSsl"];
            if (!bool.TryParse(enableSslRaw, out var enableSsl))
            {
                throw new InvalidOperationException(
                    "SmtpSettings:EnableSsl is missing or not a valid boolean. Set the SmtpSettings__EnableSsl environment variable.");
            }

            emailBuilder.AddSmtpSender(() => new SmtpClient(host, port)
            {
                EnableSsl = enableSsl,
                Credentials = new NetworkCredential(username, password),
            });
        }

        services.AddScoped<IEmailService, EmailService>();
        services.AddScoped<IMagicLinkEmailSender, MagicLinkEmailSender>();
        services.AddScoped<IUserService, UserService>();

        // Per-recipient magic-link throttle (in-memory) — caps sends per address to
        // stop a distributed mailbomb of one victim / provider-quota drain.
        services.AddMemoryCache();
        services.AddSingleton<IMagicLinkThrottle, MagicLinkThrottle>();

        // Billing seam: Stripe when configured, otherwise a direct plan flip (dev/default).
        services.Configure<StripeSettings>(configuration.GetSection("StripeSettings"));
        var stripeSettings = configuration.GetSection("StripeSettings").Get<StripeSettings>();
        if (stripeSettings?.IsConfigured == true)
        {
            services.AddScoped<IBillingService, StripeBillingService>();
        }
        else
        {
            services.AddScoped<IBillingService, DirectBillingService>();
        }

        services.AddScoped<IRefreshTokensRepository, RefreshTokensRepository>();
        services.AddScoped<IMagicLinkTokensRepository, MagicLinkTokensRepository>();
        services.AddScoped<ISpacesRepository, SpacesRepository>();
    }

    // Returns a required SMTP setting or throws a fail-loud InvalidOperationException
    // naming the missing key — never echoing the (possibly secret) value.
    private static string RequireSmtpSetting(IConfigurationSection smtpSettings, string key)
    {
        var value = smtpSettings[key];
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException(
                $"SmtpSettings:{key} is missing. Set the SmtpSettings__{key} environment variable.");
        }

        return value;
    }
}
