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
