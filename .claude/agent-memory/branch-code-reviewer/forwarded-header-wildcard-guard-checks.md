---
name: forwarded-header-wildcard-guard-checks
description: Two easy-to-miss gaps to re-check whenever the ForwardedHeaders KnownProxies/KnownNetworks wildcard guard in Program.cs changes
metadata:
  type: project
---

The B-7 forwarded-header trust binding (`src/Tidansu.API/Program.cs`, `// SECURITY
(B-7)` block) parses `ForwardedHeaders:KnownProxies` / `:KnownNetworks` from config,
rejects `"*"`/`0.0.0.0/0`, and adds parsed entries to `KnownProxies` /
`KnownIPNetworks` (the non-obsolete `System.Net.IPNetwork` API — avoids ASPDEPR005).

When reviewing any change to this block, re-check the two gaps the initial version
shipped with (flagged Minor in B-7 review, may or may not be fixed by now):

1. **IPv6 all-networks wildcard `::/0` is NOT in the reject list** — only `"*"` and
   `"0.0.0.0/0"` are. `::/0` would trust every IPv6 client and collapse the
   magic-link rate limiter for IPv6. Grep the guard for `::/0`.
2. **Malformed IP/CIDR crashes with a bare `FormatException`** from
   `IPAddress.Parse` / `IPNetwork.Parse` that names neither the config key nor the
   bad value — inconsistent with the clear key-naming messages of the wildcard
   guard and the BA-1/BA-2 fail-loud guards. Safe to echo (it is a proxy IP, not a
   secret).

**Why:** the whole point of this guard is "never silently trust a wildcard"; both
gaps are operator-error edges that fail *safe* (degrade / refuse-to-boot) rather
than breach, so they read as Minor — but they undercut the guard's stated mandate.

**How to apply:** if the diff touches this block, confirm `::/0` is rejected and
malformed values throw a keyed `InvalidOperationException`. The two new fail-loud
guards (FrontendUrl in `WebApplicationBuilderExtensions.cs`, TidansuDb connection
string in `ServiceCollectionExtensions.cs`) key off `IsProduction()` like the JWT
guard — note the SMTP guard instead uses `!IsDevelopment()`, so Staging behaves
differently between the two idioms. See also [[email-delivery-failure-path]].
