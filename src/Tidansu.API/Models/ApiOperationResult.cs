using Microsoft.AspNetCore.Http.HttpResults;
using Tidansu.Extensions;

namespace Tidansu.Models;

public class ApiOperationResult
{
    public const string GeneralErrorKey = "general";

    public Dictionary<string, string[]> Errors { get; set; } = new();

    public bool IsSuccess { get; set; }

    public static BadRequest<ApiOperationResult> BadRequest(string errorText, string errorKey = GeneralErrorKey)
    {
        return TypedResults.BadRequest(new ApiOperationResult
        {
            IsSuccess = false,
            Errors = new Dictionary<string, string[]>
            {
                {
                    errorKey.ToCamelCase(), new[] { errorText }
                }
            }
        });
    }

    public static BadRequest<ApiOperationResult> BadRequest(Dictionary<string, string[]> errors)
    {
        var camelCaseErrors = errors.ToDictionary(
            kvp => kvp.Key.ToCamelCase(),
            kvp => kvp.Value
        );

        return TypedResults.BadRequest(new ApiOperationResult
        {
            IsSuccess = false,
            Errors = camelCaseErrors
        });
    }

    public static NotFound<ApiOperationResult> NotFound(string errorText, string errorKey = GeneralErrorKey)
    {
        return TypedResults.NotFound(new ApiOperationResult
        {
            IsSuccess = false,
            Errors = new Dictionary<string, string[]>
            {
                {
                    errorKey.ToCamelCase(), new[] { errorText }
                }
            }
        });
    }

    public static Ok<ApiOperationResult> Ok()
    {
        return TypedResults.Ok(new ApiOperationResult
        {
            IsSuccess = true
        });
    }

    public static Ok<ApiOperationResult<T>> Ok<T>(T data)
    {
        return TypedResults.Ok(new ApiOperationResult<T>
        {
            Data = data,
            IsSuccess = true
        });
    }

    public static Results<Ok<ApiOperationResult>, BadRequest<ApiOperationResult>> OkOrBadRequest(
        bool success,
        string? errorText = null,
        string errorKey = GeneralErrorKey)
    {
        return success
            ? Ok()
            : BadRequest(errorText ?? "Operation failed", errorKey);
    }
}

public class ApiOperationResult<T> : ApiOperationResult
{
    public T Data { get; set; } = default!;
}
