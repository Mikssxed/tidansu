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
            // (SmtpSettings__Username / SmtpSettings__Password), never committed config.
            emailBuilder.AddSmtpSender(() => new SmtpClient(
                smtpSettings["Host"] ?? "localhost",
                int.Parse(smtpSettings["Port"] ?? "587"))
            {
                EnableSsl = bool.Parse(smtpSettings["EnableSsl"] ?? "true"),
                Credentials = new NetworkCredential(
                    smtpSettings["Username"],
                    smtpSettings["Password"]),
            });
        }

        services.AddScoped<IEmailService, EmailService>();

        services.AddScoped<IRefreshTokensRepository, RefreshTokensRepository>();
    }
}
