using Tidansu.Domain.Exceptions;
using Tidansu.Extensions;
using Tidansu.Models;

namespace Tidansu.Middlewares;

public class ErrorHandlingMiddleware(ILogger<ErrorHandlingMiddleware> logger) : IMiddleware
{
    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        try
        {
            await next.Invoke(context);
        }
        catch (ValidationException ex)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            context.Response.ContentType = "application/json";

            var camelCaseErrors = ex.Errors.ToDictionary(
                kvp => kvp.Key.ToCamelCase(),
                kvp => kvp.Value
            );

            var errorResponse = new ApiOperationResult
            {
                IsSuccess = false,
                Errors = camelCaseErrors
            };

            await context.Response.WriteAsJsonAsync(errorResponse);
            logger.LogWarning(ex, "Validation error: {Message}", ex.Message);
        }
        catch (NotFoundException ex)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            context.Response.ContentType = "application/json";

            var errorResponse = new ApiOperationResult
            {
                IsSuccess = false,
                Errors = new Dictionary<string, string[]>
                {
                    { ApiOperationResult.GeneralErrorKey, new[] { ex.Message } }
                }
            };

            await context.Response.WriteAsJsonAsync(errorResponse);
            logger.LogWarning(ex.Message);
        }
        catch (PlanLimitException ex)
        {
            // 403 with the paywall reason so the client can open the matching paywall.
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            context.Response.ContentType = "application/json";

            var errorResponse = new ApiOperationResult
            {
                IsSuccess = false,
                Errors = new Dictionary<string, string[]>
                {
                    { "plan", new[] { ex.Reason } }
                }
            };

            await context.Response.WriteAsJsonAsync(errorResponse);
            logger.LogInformation("Plan limit hit: {Reason}", ex.Reason);
        }
        catch (ForbidException)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            context.Response.ContentType = "application/json";

            var errorResponse = new ApiOperationResult
            {
                IsSuccess = false,
                Errors = new Dictionary<string, string[]>
                {
                    { ApiOperationResult.GeneralErrorKey, new[] { "You do not have permission to perform this action." } }
                }
            };

            await context.Response.WriteAsJsonAsync(errorResponse);
        }
        catch (AuthenticationException)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            context.Response.ContentType = "application/json";

            var errorResponse = new ApiOperationResult
            {
                IsSuccess = false,
                Errors = new Dictionary<string, string[]>
                {
                    { ApiOperationResult.GeneralErrorKey, new[] { "Authentication failed. Please check your credentials and try again." } }
                }
            };
            await context.Response.WriteAsJsonAsync(errorResponse);
        }
        catch (EmailDeliveryException ex)
        {
            // Delivery failed — report as a failure (never a silent success). The
            // exception message carries only the recipient (no body/link/secret);
            // the client gets a generic message.
            logger.LogError(ex.Message);

            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/json";

            var errorResponse = new ApiOperationResult
            {
                IsSuccess = false,
                Errors = new Dictionary<string, string[]>
                {
                    { ApiOperationResult.GeneralErrorKey, new[] { "Something went wrong." } }
                }
            };

            await context.Response.WriteAsJsonAsync(errorResponse);
        }
        catch (MagicLinkThrottledException ex)
        {
            // Per-recipient throttle hit. Generic 429 identical whether or not the
            // account exists (anti-enumeration). Message carries only the recipient.
            logger.LogWarning(ex.Message);

            context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
            context.Response.ContentType = "application/json";

            var errorResponse = new ApiOperationResult
            {
                IsSuccess = false,
                Errors = new Dictionary<string, string[]>
                {
                    { ApiOperationResult.GeneralErrorKey, new[] { "Too many requests. Please try again later." } }
                }
            };

            await context.Response.WriteAsJsonAsync(errorResponse);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, ex.Message);

            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/json";

            var errorResponse = new ApiOperationResult
            {
                IsSuccess = false,
                Errors = new Dictionary<string, string[]>
                {
                    { ApiOperationResult.GeneralErrorKey, new[] { "Something went wrong." } }
                }
            };

            await context.Response.WriteAsJsonAsync(errorResponse);
        }
    }
}
