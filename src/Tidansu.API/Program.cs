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
// SECURITY (B-7): KnownProxies/KnownNetworks are left at the framework default (loopback
// only), so forwarded headers are trusted ONLY from a loopback proxy — an arbitrary
// client CANNOT spoof X-Forwarded-For to dodge the limiter. The real production proxy's
// address(es)/network(s) MUST be added to KnownProxies/KnownNetworks at deploy time
// (task B-7), otherwise the forwarded IP will be ignored and every user shares one bucket.
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
});

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

app.UseRateLimiter();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Client-side routes (e.g. /spaces) fall back to the SPA entry point
app.MapFallbackToFile("index.html");

app.Run();
