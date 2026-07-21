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
        catch (Microsoft.AspNetCore.Http.BadHttpRequestException ex)
        {
            // Kestrel throws this when a request body exceeds the per-endpoint
            // RequestSizeLimit (StatusCode 413) or is otherwise malformed. Surface its
            // real 4xx code instead of masking it as a 500 in the generic catch below.
            // Never log the body or ex.Message — it could echo an attacker payload.
            logger.LogWarning("Bad request rejected: {StatusCode}", ex.StatusCode);

            context.Response.StatusCode = ex.StatusCode;
            context.Response.ContentType = "application/json";

            var errorResponse = new ApiOperationResult
            {
                IsSuccess = false,
                Errors = new Dictionary<string, string[]>
                {
                    { ApiOperationResult.GeneralErrorKey, new[] { "Request rejected." } }
                }
            };

            await context.Response.WriteAsJsonAsync(errorResponse);
        }
        catch (BillingUnavailableException ex)
        {
            // Billing is deliberately off or misconfigured. Fail clearly (never a silent
            // free upgrade, never a crash); the account stays on its current plan. Logged
            // at Warning without echoing any config; the client gets a generic message.
            logger.LogWarning(ex, "Billing unavailable");

            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            context.Response.ContentType = "application/json";

            var errorResponse = new ApiOperationResult
            {
                IsSuccess = false,
                Errors = new Dictionary<string, string[]>
                {
                    { ApiOperationResult.GeneralErrorKey, new[] { "Billing is currently unavailable." } }
                }
            };

            await context.Response.WriteAsJsonAsync(errorResponse);
        }
        catch (Microsoft.EntityFrameworkCore.DbUpdateException ex)
        {
            // B-22 S-1/S-2: a persistence-level failure (e.g. a rare check-then-insert
            // race losing to a concurrent duplicate — see SpacesRepository's
            // ItemExistsInSpaceAsync/ZoneExistsInSpaceAsync pre-checks, C-5) must never
            // surface a distinct shape from the generic 500 below. SQL Server's
            // duplicate-key error text embeds the colliding key value verbatim — i.e.
            // another tenant's real zone/item id — so ex.Message/ex.InnerException.Message
            // must never reach the response. Logged server-side only; the body is
            // byte-identical to the catch-all below (same status, same generic message):
            // a caller must not be able to distinguish this from any other failure.
            logger.LogError(ex, "Persistence failure: {Message}", ex.Message);

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
