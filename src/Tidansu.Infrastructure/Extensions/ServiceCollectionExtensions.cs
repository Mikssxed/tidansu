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

        // A blank connection string would let the app boot, skip the migration (Program.cs), and
        // 500 on the first request — fail loud instead. Scoped to !IsDevelopment() (not just
        // IsProduction()) so a mis-named non-dev environment (e.g. Staging) still fails loud instead
        // of silently skipping the guard; Development/the swagger CLI still boot with an empty
        // connection string.
        if (!environment.IsDevelopment() && string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "ConnectionStrings:TidansuDb is missing. Set the ConnectionStrings__TidansuDb environment variable.");
        }

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

        // Billing seam selection (FR-2 — never a silent free Pro in production):
        //   Enabled && IsConfigured  → StripeBillingService (real payments)
        //   Enabled && !IsConfigured  → fail loud at startup (mirror the JWT/SMTP guards)
        //   !Enabled  in Development  → DirectBillingService  (dev convenience: flip now)
        //   !Enabled  in Production   → DisabledBillingService (deliberate off, no free Pro)
        services.Configure<StripeSettings>(configuration.GetSection("StripeSettings"));
        var stripeSettings = configuration.GetSection("StripeSettings").Get<StripeSettings>() ?? new StripeSettings();
        if (stripeSettings.Enabled)
        {
            if (!stripeSettings.IsConfigured)
            {
                // Enabled but misconfigured → refuse to boot rather than fall back to a
                // free-Pro path. Name the missing key(s); never echo the (secret) values.
                var missing = new List<string>();
                if (string.IsNullOrWhiteSpace(stripeSettings.SecretKey)) missing.Add("StripeSettings__SecretKey");
                if (string.IsNullOrWhiteSpace(stripeSettings.WebhookSecret)) missing.Add("StripeSettings__WebhookSecret");
                if (string.IsNullOrWhiteSpace(stripeSettings.ProPriceId)) missing.Add("StripeSettings__ProPriceId");
                throw new InvalidOperationException(
                    $"StripeSettings is Enabled but not fully configured. Set the {string.Join(" and ", missing)} environment variable(s).");
            }

            services.AddScoped<IBillingService, StripeBillingService>();
        }
        else if (environment.IsDevelopment())
        {
            services.AddScoped<IBillingService, DirectBillingService>();
        }
        else
        {
            services.AddScoped<IBillingService, DisabledBillingService>();
        }

        services.AddScoped<IProcessedStripeEventStore, ProcessedStripeEventStore>();

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
