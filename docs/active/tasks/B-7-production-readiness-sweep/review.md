# Code Review: B-7 Production-readiness sweep

**Date**: 2026-07-13
**Reviewer**: branch-code-reviewer agent
**Diff base**: working tree vs `origin/main` (changes are uncommitted on `main`)
**Files changed**: 4 source (+ task-folder docs, agent-memory)

## Summary
A tightly-scoped verification-and-hardening sweep that lands exactly the four
approved config edits (BA-1…BA-4) and nothing else — no migration, no Kiota regen,
no auth/billing logic change. The two new fail-loud guards correctly name their
config key, never echo the value, and are `IsProduction()`-scoped so Development /
the swagger CLI still boot. The forwarded-header binding is implemented safely
(add-only, never `Clear()`-then-trust-all, blank → loopback default preserved) and
the `.NET 10` `KnownIPNetworks` + `System.Net.IPNetwork.Parse` choice correctly
sidesteps the obsolete `KnownNetworks` (ASPDEPR005). Build is green. **No Critical
or Major issues.** Two Minor hardening gaps in the BA-3 value validation are worth
closing; both are operator-error edge cases that fail *safe* (degrade or refuse to
boot), not security holes.

## 🔴 Critical (must fix before merge)
None.

## 🟠 Major (strongly recommended)
None.

## 🟡 Minor (nice-to-have)

### [N1] IPv6 all-networks wildcard `::/0` is not rejected
**File**: `src/Tidansu.API/Program.cs:60`
**Category**: Security (rate-limiter trust) / hardening
**Description**: The network guard rejects `"*"` and `"0.0.0.0/0"`, but `::/0`
— the IPv6 equivalent of trust-all — passes straight through to
`KnownIPNetworks.Add(IPNetwork.Parse("::/0"))`. An operator who sets `::/0`
(a plausible "catch-all" mistake, symmetric to the `0.0.0.0/0` that *is* caught)
would trust every IPv6 client, collapsing the magic-link rate limiter for IPv6
traffic. Impact is limited to rate-limiter degradation (the same "degrade" class
the plan already accepts for an unset proxy), not an auth bypass, and it requires
the operator to deliberately type an IPv6 wildcard — hence Minor. But the task's
explicit mandate is "genuinely rejects wildcards," and this one slips through.
**Recommendation**: add `"::/0"` (and, defensively, `"::0/0"`) to the rejected
literals:
```csharp
if (network is "*" or "0.0.0.0/0" or "::/0")
```

### [N2] Malformed proxy/CIDR value crashes with an unhelpful framework message
**File**: `src/Tidansu.API/Program.cs:55,66`
**Category**: Operability / diagnostics
**Description**: A bad entry (typo, stray whitespace, `"10.0.0/8"`) reaches
`IPAddress.Parse` / `System.Net.IPNetwork.Parse`, which throw a bare
`FormatException` ("An invalid IP address was specified." / a CIDR parse failure)
that names **neither** the offending config key nor the bad value. This still
fails loud and fail-safe (the app refuses to boot rather than trust garbage), so
it is not a security defect — but it is inconsistent with the clear, key-naming
messages the wildcard guard and BA-1/BA-2 produce, and the review brief explicitly
asked to flag "any way a malformed config value crashes unhelpfully vs. a clear
message." The value here is a proxy IP/CIDR, not a secret, so it is safe to echo.
**Recommendation**: wrap the parse (or catch `FormatException`) and rethrow an
`InvalidOperationException` naming the key + the rejected entry, e.g.
`$"ForwardedHeaders:KnownProxies contains an invalid IP address: '{proxy}'."`.

## 🧭 Convention Violations (project rules)
None. The new guards mirror the existing `JwtSettings:Secret` guard
(`WebApplicationBuilderExtensions.cs:33-37`) in shape, message form
("… is missing. Set the `X__Y` environment variable."), and placement (before the
consuming registration). No secret is echoed. `appsettings.Development.json` keeps
EF Core at `Information` (line 39) while the base drops to `Warning` — exactly as
BA-4 intended. No template/hex/Kiota rules are in play (no frontend or contract
change).

## 🏗️ Architecture Notes
- **Two "prod-only guard" idioms coexist.** The new guards (and the existing JWT
  guard) key off `IsProduction()`, while the SMTP guard keys off the
  non-Development branch (`!IsDevelopment()`). Consequence: in a *Staging*
  environment, the FrontendUrl and connection-string guards would **not** fire,
  but the SMTP guard would. This is pre-existing, the plan explicitly told the dev
  to mirror the JWT guard, and this project has no Staging tier today — so it is a
  note, not a finding. Worth normalizing if a Staging environment ever appears.
- **BA-3 parsing runs in every environment** (it is intentionally env-driven, not
  `IsProduction()`-gated) with blank → framework loopback-only default. Correct and
  fail-safe.
- **FR-6 CORS rough edge is honestly logged, not swallowed.** The proof-checklist
  records that a request from the *configured* origin also got no
  `Access-Control-Allow-Origin` in local testing, correctly dispositions it as
  out-of-scope under the single-origin topology (browser never invokes CORS
  same-origin), and batches it for owner review rather than auto-filing. The stated
  cause is flagged as an untested hypothesis — appropriately cautious. No code
  change belongs in this sweep for it. If a split deployment ever appears, this
  needs a real follow-up (candidate: verify `UseCors` sits correctly in the
  minimal-hosting pipeline relative to endpoint routing).

## Proof-checklist cross-check (claims vs. code)
- **FR-5** — the four quoted exception messages match the source verbatim
  (`WebApplicationBuilderExtensions.cs:74-75`, `ServiceCollectionExtensions.cs:26-27`,
  and the two existing guards). Consistent. ✅
- **FR-10** — wildcard-rejection messages match `Program.cs:51-52,62-63`; add-only /
  blank-default behavior matches the code. The "How proven" column exercised only
  `KnownProxies "*"` and a valid IP/CIDR; it did **not** exercise `KnownNetworks
  "0.0.0.0/0"` or a malformed value — a thoroughness gap in the *proof*, not a code
  defect, and it happens to be exactly where N1/N2 live. ✅ (with the N1/N2 caveats)
- **FR-11** — EF Core `Information`→`Warning` in the base `appsettings.json`
  matches BA-4; Development retains `Information`. Consistent. ✅
- **FR-1** — honestly marked ⏳ Pending for the authenticated legs (no real inbox
  to complete sign-in); no overclaim. ✅
- **V-9 build-green** — independently reconfirmed: `dotnet build` of the API
  succeeds, 0 errors. (12 NU1903 warnings are pre-existing transitive package CVEs
  — AutoMapper 12, System.Security.Cryptography.Xml 9, Microsoft.OpenApi 2.4.1 —
  not introduced by this branch; they belong to B-8's security/scale audit.)

## 👍 Positives
- Zero scope creep: the diff is precisely the four planned edits; the "no migration
  / no Kiota" self-imposed guardrails held.
- Correct, well-documented `.NET 10` API choice: `KnownIPNetworks` +
  `System.Net.IPNetwork.Parse` to avoid the deprecated `KnownNetworks`
  (ASPDEPR005), with the config key kept human-readable and the rationale inline.
- Forwarded-header binding is add-only and fail-safe on blank — the single most
  important security property of BA-3 — and rejects the common `"*"`/`0.0.0.0/0`
  wildcards with clear, key-naming messages.
- Guards are secret-safe: they name the key and the `X__Y` env var, never the
  value — aligns with the established `config-fail-loud-and-secret-logging`
  convention.
- The proof-checklist is legible, honest about Pending vs. Verified, and batches
  rough edges for owner review instead of auto-filing (per OQ-4).

## Action Checklist
- [x] [N1] Add `"::/0"` to the `KnownNetworks` wildcard-reject list (`Program.cs:60`).
      Fixed 2026-07-13 — also rejects `"::"` and applies the check trimmed/
      case-insensitively; see `proof-checklist.md` § Review-fix hardening (F1).
- [x] [N2] Wrap `IPAddress.Parse`/`IPNetwork.Parse` and rethrow an
      `InvalidOperationException` naming the key + offending entry (`Program.cs:55,66`).
      Fixed 2026-07-13 — see `proof-checklist.md` § Review-fix hardening (F2).
- [x] (optional) When exercising FR-10 next, also test `KnownNetworks "0.0.0.0/0"`
      and a malformed value to close the proof-thoroughness gap.
      Done as part of the F1/F2 fix verification 2026-07-13 (also covered
      `::/0`, `"::"`, and a malformed CIDR/IP — see `proof-checklist.md`).
