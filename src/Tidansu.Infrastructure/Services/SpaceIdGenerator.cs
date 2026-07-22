using System.Security.Cryptography;
using Tidansu.Domain.Interfaces;

namespace Tidansu.Infrastructure.Services;

// B-23: Space.Id is now server-assigned rather than client-supplied (see
// CreateSpaceCommandHandler), closing the cross-tenant collision/DoS/existence-oracle
// that the low-entropy, clock-derived client id (`uid('space')`) opened. 128 bits from
// RandomNumberGenerator (not Guid.NewGuid — v4 GUIDs are random but not spec-guaranteed
// CSPRNG, and unpredictability is the entire point here) base64url-encoded, prefixed
// "space_" for readability/debuggability. 16 random bytes → 22 base64url chars (no
// padding) + "space_" (6 chars) = 28 chars total, comfortably under the Spaces.Id
// column's HasMaxLength(64) (TidansuDbContext.cs).
public class SpaceIdGenerator : ISpaceIdGenerator
{
    private const int RandomByteCount = 16;

    public string Generate()
    {
        var bytes = RandomNumberGenerator.GetBytes(RandomByteCount);
        var base64Url = Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

        return $"space_{base64Url}";
    }
}
