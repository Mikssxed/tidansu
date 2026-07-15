using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using Serilog;
using Tidansu.Middlewares;

namespace Tidansu.Extensions;

public static class WebApplicationBuilderExtensions
{
    public const string AuthRateLimitPolicy = "auth";

    // Stricter per-IP window for the magic-link REQUEST endpoint specifically: it now
    // triggers real, quota-metered outbound email, so it must be tighter than the
    // shared "auth" policy. 3/min per IP comfortably covers a real user's retries/
    // double-clicks while sharply limiting how fast one IP can drive sends.
    public const string MagicLinkRateLimitPolicy = "magic-link";

    // Endpoint-wide budget for the Stripe webhook, not per-IP: Stripe delivers from a
    // rotating IP range, so an IP-keyed budget (like the auth limiters above) would be
    // meaningless here. A single shared fixed-window budget bounds a flood regardless
    // of source IP.
    public const string WebhookRateLimitPolicy = "billing-webhook";

    public const string FrontendCorsPolicy = "frontend";

    public static void AddPresentation(this WebApplicationBuilder builder)
    {
        // Configure JWT Authentication
        var jwtSettings = builder.Configuration.GetSection("JwtSettings");
        var secretKey = jwtSettings["Secret"];

        // The secret must never live in committed config; any non-dev environment
        // (Production, Staging, or a mis-named env) supplies it via JwtSettings__Secret.
        if (!builder.Environment.IsDevelopment() && (string.IsNullOrEmpty(secretKey) || secretKey.Length < 32))
        {
            throw new InvalidOperationException(
                "JwtSettings:Secret is missing or shorter than 32 characters. Set the JwtSettings__Secret environment variable.");
        }

        // Only configure JWT if settings are present (allows the swagger CLI to run)
        if (!string.IsNullOrEmpty(secretKey))
        {
            builder.Services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = jwtSettings["Issuer"],
                    ValidAudience = jwtSettings["Audience"],
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey)),
                    ClockSkew = TimeSpan.Zero // Remove default 5 minute tolerance
                };
            });
        }
        else
        {
            builder.Services.AddAuthentication();
        }

        // CORS — the Vite dev server is a separate origin (the prod SPA is same-origin from wwwroot).
        var frontendUrl = builder.Configuration["AppSettings:FrontendUrl"];

        // A blank FrontendUrl breaks magic-link + Checkout return URLs and leaves CORS with a
        // zero-origin policy, so fail loud rather than boot half-broken. Scoped to !IsDevelopment()
        // (not just IsProduction()) so a mis-named non-dev environment (e.g. Staging) still fails
        // loud instead of silently skipping the guard; Development/the swagger CLI still boot blank.
        if (!builder.Environment.IsDevelopment() && string.IsNullOrWhiteSpace(frontendUrl))
        {
            throw new InvalidOperationException(
                "AppSettings:FrontendUrl is missing. Set the AppSettings__FrontendUrl environment variable.");
        }

        builder.Services.AddCors(options =>
        {
            options.AddPolicy(FrontendCorsPolicy, policy =>
            {
                if (!string.IsNullOrEmpty(frontendUrl))
                {
                    policy.WithOrigins(frontendUrl)
                        .AllowAnyHeader()
                        .AllowAnyMethod()
                        .AllowCredentials();
                }
            });
        });

        builder.Services.AddControllers()
            .AddJsonOptions(options =>
            {
                options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
            });

        builder.Services.AddSwaggerGen(c =>
        {
            c.SupportNonNullableReferenceTypes();

            c.AddSecurityDefinition("bearerAuth", new OpenApiSecurityScheme()
            {
                Type = SecuritySchemeType.Http,
                Scheme = "Bearer"
            });

            c.AddSecurityRequirement(doc => new OpenApiSecurityRequirement
            {
                [new OpenApiSecuritySchemeReference("bearerAuth", doc)] = []
            });
        });
        builder.Services.AddEndpointsApiExplorer();

        builder.Services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy(AuthRateLimitPolicy, httpContext =>
                RateLimitPartition.GetFixedWindowLimiter(
                    httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 10,
                        Window = TimeSpan.FromMinutes(1)
                    }));
            options.AddPolicy(MagicLinkRateLimitPolicy, httpContext =>
                RateLimitPartition.GetFixedWindowLimiter(
                    httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 3,
                        Window = TimeSpan.FromMinutes(1)
                    }));
            options.AddPolicy(WebhookRateLimitPolicy, _ =>
                RateLimitPartition.GetFixedWindowLimiter(
                    "billing-webhook", // constant key = one shared endpoint budget
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 60,
                        Window = TimeSpan.FromMinutes(1)
                    }));
        });

        builder.Services.AddResponseCompression(options =>
        {
            options.EnableForHttps = true;
            options.Providers.Add<BrotliCompressionProvider>();
            options.Providers.Add<GzipCompressionProvider>();
        });

        builder.Services.AddScoped<ErrorHandlingMiddleware>();
        builder.Host.UseSerilog((context, configuration) =>
            configuration.ReadFrom.Configuration(context.Configuration));
    }
}
