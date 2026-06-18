var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapControllers();

// SPA fallback — serve index.html for client-side routes (Vue Router history mode).
app.MapFallbackToFile("index.html");

app.Run();
