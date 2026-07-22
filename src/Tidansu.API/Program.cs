using System.Net;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Tidansu.Application.Extensions;
using Tidansu.Extensions;
using Tidansu.Infrastructure.Extensions;
using Tidansu.Infrastructure.Persistence;
using Tidansu.Middlewares;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddInfrastructure(builder.Configuration, builder.Environment);
builder.AddPresentation();
builder.Services.AddApplication(builder.Configuration);

var app = builder.Build();

// Automatically apply database migrations on startup (skip if no connection string)
var connectionString = builder.Configuration.GetConnectionString("TidansuDb");
if (!string.IsNullOrEmpty(connectionString))
{
    using var scope = app.Services.CreateScope();
    var dbContext = scope.ServiceProvider.GetRequiredService<TidansuDbContext>();
    dbContext.Database.Migrate();
}

// Resolve the real client IP/scheme from X-Forwarded-For / X-Forwarded-Proto so the
// per-IP rate limiter partitions on the actual client (not the proxy) behind a reverse
// proxy / load balancer. Runs first so every downstream component sees the corrected IP.
//
// SECURITY (B-7): KnownProxies/KnownNetworks are bound from config (ForwardedHeaders__KnownProxies
// / ForwardedHeaders__KnownNetworks below) so forwarded headers are trusted ONLY from an explicitly
// configured proxy. When both are blank, this falls back to the framework default (loopback only) —
// an arbitrary client still CANNOT spoof X-Forwarded-For to dodge the limiter. The real production
// proxy's address(es)/network(s) are a deploy-time value: set them via the env vars above once the
// production topology is known (task B-7); a wildcard ("*", "0.0.0.0/0", "::/0", "::" — trimmed,
// case-insensitive) is rejected at startup, and a malformed entry fails loud naming the config key
// instead of a bare FormatException. Networks bind to
// options.KnownIPNetworks (the non-obsolete System.Net.IPNetwork-based property) — KnownNetworks
// is deprecated (ASPDEPR005) but the config key stays "KnownNetworks" for operator readability.
var forwardedHeadersOptions = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
};

var knownProxies = builder.Configuration.GetSection("ForwardedHeaders:KnownProxies").Get<string[]>() ?? [];
var knownNetworks = builder.Configuration.GetSection("ForwardedHeaders:KnownNetworks").Get<string[]>() ?? [];

foreach (var proxy in knownProxies)
{
    var trimmedProxy = proxy.Trim();
    if (string.Equals(trimmedProxy, "*", StringComparison.OrdinalIgnoreCase))
    {
        throw new InvalidOperationException(
            "ForwardedHeaders:KnownProxies must not contain a wildcard (\"*\"). List explicit proxy IP addresses.");
    }

    if (!IPAddress.TryParse(trimmedProxy, out var proxyAddress))
    {
        throw new InvalidOperationException(
            $"ForwardedHeaders:KnownProxies contains an invalid IP address: '{proxy}'.");
    }

    forwardedHeadersOptions.KnownProxies.Add(proxyAddress);
}

foreach (var network in knownNetworks)
{
    var trimmedNetwork = network.Trim();
    if (string.Equals(trimmedNetwork, "*", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(trimmedNetwork, "0.0.0.0/0", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(trimmedNetwork, "::/0", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(trimmedNetwork, "::", StringComparison.OrdinalIgnoreCase))
    {
        throw new InvalidOperationException(
            "ForwardedHeaders:KnownNetworks must not contain a wildcard (\"*\", \"0.0.0.0/0\", \"::/0\", or \"::\"). List explicit CIDR ranges.");
    }

    if (!System.Net.IPNetwork.TryParse(trimmedNetwork, out var parsedNetwork))
    {
        throw new InvalidOperationException(
            $"ForwardedHeaders:KnownNetworks contains an invalid CIDR range: '{network}'.");
    }

    // Reject any full-coverage range regardless of spelling — a /0 (or split
    // full-coverage pairs like 0.0.0.0/1 + 128.0.0.0/1) trusts every client and
    // re-opens X-Forwarded-For spoofing. Catches ranges the string checks above miss.
    if (parsedNetwork.PrefixLength == 0)
    {
        throw new InvalidOperationException(
            $"ForwardedHeaders:KnownNetworks must not contain a /0 (all-addresses) range: '{network}'. List explicit CIDR ranges.");
    }

    forwardedHeadersOptions.KnownIPNetworks.Add(parsedNetwork);
}

app.UseForwardedHeaders(forwardedHeadersOptions);

app.UseMiddleware<ErrorHandlingMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
else
{
    app.UseHsts();
}

app.UseHttpsRedirection();

app.Use(async (context, next) =>
{
    context.Response.Headers.XContentTypeOptions = "nosniff";
    context.Response.Headers.XFrameOptions = "DENY";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    await next();
});

app.UseResponseCompression();

// Serve the built SPA from wwwroot (vite build outputs there)
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseCors(WebApplicationBuilderExtensions.FrontendCorsPolicy);

app.UseAuthentication();
app.UseAuthorization();

// B-23 (S-3): must run AFTER UseAuthentication/UseAuthorization — the per-account
// space-create policy partitions on httpContext.User, which is empty until
// authentication has run. Left before auth (as it was until B-23), every request would
// silently fall through to that policy's IP fallback, collapsing per-account limiting to
// per-IP. Placing it here also means an unauthenticated caller is rejected by
// [Authorize] before it can consume any per-account budget. The IP-keyed limiters (auth,
// magic-link, billing-webhook) are unaffected by this move — they key on
// RemoteIpAddress/a constant set by UseForwardedHeaders above, independent of auth.
app.UseRateLimiter();

app.MapControllers();

// Client-side routes (e.g. /spaces) fall back to the SPA entry point
app.MapFallbackToFile("index.html");

app.Run();
