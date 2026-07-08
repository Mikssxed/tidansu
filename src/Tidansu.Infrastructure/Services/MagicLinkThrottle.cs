using Microsoft.Extensions.Caching.Memory;
using Tidansu.Domain.Interfaces;

namespace Tidansu.Infrastructure.Services;

// Per-recipient throttle for magic-link sends, keyed on the normalized email.
// Complements the per-IP rate limiter: a distributed mailbomb of ONE victim (or a
// burst that drains the shared provider quota) comes from many IPs but always targets
// the same address, so we cap by recipient. Backed by IMemoryCache (single-process;
// sufficient at launch scale — revisit with a distributed cache if the API scales out).
public class MagicLinkThrottle(IMemoryCache cache) : IMagicLinkThrottle
{
    // Minimum gap between two sends to the same address (blocks rapid repeats).
    private static readonly TimeSpan Cooldown = TimeSpan.FromSeconds(60);

    // Rolling window and its cap: at most MaxPerWindow links per address per window.
    private static readonly TimeSpan Window = TimeSpan.FromHours(1);
    private const int MaxPerWindow = 5;

    private const string KeyPrefix = "magic-link-throttle:";

    public bool TryRegisterSend(string normalizedEmail)
    {
        var key = KeyPrefix + normalizedEmail;

        // The list of recent send timestamps is the cache value; lock on it so the
        // check-and-record is atomic under concurrent requests for the same address.
        var sends = cache.GetOrCreate(key, entry =>
        {
            entry.SlidingExpiration = Window;
            return new List<DateTime>();
        })!;

        lock (sends)
        {
            var now = DateTime.UtcNow;
            sends.RemoveAll(sentAt => now - sentAt >= Window);

            if (sends.Count > 0 && now - sends[^1] < Cooldown)
            {
                return false;
            }

            if (sends.Count >= MaxPerWindow)
            {
                return false;
            }

            sends.Add(now);
            return true;
        }
    }
}
