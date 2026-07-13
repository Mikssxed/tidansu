---
name: dotnet10-forwardedheaders-knownipnetworks
description: ForwardedHeadersOptions.KnownNetworks is obsolete in this repo's .NET 10 — use KnownIPNetworks + System.Net.IPNetwork, and disambiguate the IPNetwork type
metadata:
  type: feedback
---

Binding `ForwardedHeadersOptions.KnownProxies`/`KnownNetworks` from configuration
(done for B-7's reverse-proxy trust hardening) hits two non-obvious ASP.NET Core
10 API traps.

**Why:** `dotnet build` only surfaces these as an ambiguous-reference **error**
(not a helpful "use the other property" message) plus a separate obsolete
**warning** you could easily miss/suppress.

**How to apply:**
- `ForwardedHeadersOptions.KnownNetworks` (`List<Microsoft.AspNetCore.HttpOverrides.IPNetwork>`)
  is marked `[Obsolete]` (`ASPDEPR005`) in .NET 10 — use
  `options.KnownIPNetworks` (`List<System.Net.IPNetwork>`) instead. The config
  key/env-var name can still be called `KnownNetworks` for operator readability;
  it's only the C# property that changed.
- If the file already has `using Microsoft.AspNetCore.HttpOverrides;` (needed for
  `ForwardedHeadersOptions` itself) and you add `using System.Net;`, a bare
  `IPNetwork.Parse(...)` is a **CS0104 ambiguous reference** between the old
  `Microsoft.AspNetCore.HttpOverrides.IPNetwork` and `System.Net.IPNetwork` —
  fully qualify as `System.Net.IPNetwork.Parse(...)` rather than adding another
  using/alias.
- `KnownProxies` (single IPs, `System.Net.IPAddress`) is unaffected — only the
  CIDR-network property moved.
