---
name: confirmed-protections-overcap-and-space-id
description: Verified B-23 (server-assigned CSPRNG Space.Id + per-account rate limit) and B-24 (over-cap read-only guard) controls — don't re-flag these
metadata:
  type: project
---

Traced to ground during the B-23/B-24 audit (2026-07-22). Don't re-flag:

**B-23 — Space.Id no longer client-trusted.**
- `SpaceIdGenerator.Generate()` = `RandomNumberGenerator.GetBytes(16)` (128-bit),
  base64url, `space_`-prefixed, 28 chars < `nvarchar(64)`. Sound CSPRNG.
- Create path uses ONLY `SpaceDto.ToEntity(userId, spaceId)` (two-arg, server id);
  the single-arg `ToEntity(userId)` (trusts client `Id`) has **zero callers** — dead
  code, flagged Low S-L1 (delete or rename it). Grep `.ToEntity(` to re-verify.
- Rate limiter `space-create` partitions on `ClaimTypes.NameIdentifier`; works because
  `app.UseRateLimiter()` was moved AFTER `UseAuthentication`/`UseAuthorization`
  (`Program.cs`). IP-keyed limiters (auth/magic-link/billing-webhook) key on
  `RemoteIpAddress`/constant set by `UseForwardedHeaders` and are unaffected by the move.

**B-24 — over-cap read-only server gate.**
- `SpaceOverCapGuard.EnsureSpaceContentWritableAsync` called by all 7 mutate handlers
  AFTER the owner-scoped 404 and BEFORE any mutation. Verified per-handler. Fails closed
  (throws; Pro short-circuits only on genuinely-null `caps.Spaces`).
- `CountSpacesOrderedBeforeAsync` uses `string.Compare(s.Id, spaceId) < 0` → SQL-side
  `WHERE Id < @spaceId`, collation-matched to `OrderBy(Id)`. No in-memory ordinal compare.
- RemoveZone/RemoveItem gained explicit owner-scoped `*ExistsInSpaceAsync ?? 404`
  pre-checks so removal cannot leak an over-cap oracle on non-owned spaces.
- DeleteSpace intentionally ungated (recovery path).
- Live evaluation — no downgrade-race persistent write window.

Known residual: [[overcap-parity-random-id-interaction]] (SPA/server badge divergence;
UX, not a bypass).
