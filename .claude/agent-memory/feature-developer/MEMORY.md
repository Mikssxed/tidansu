# Memory index

- [Verify frontend via isolated harness](verify-frontend-isolated-harness.md) — drive a Vue leaf component without the backend using a Vite harness + headless Edge over CDP
- [Verify Production-like backend drives](verify-prod-env-drives.md) — env vars, readiness polling (swagger is dev-only), and fast SMTP-fail setup for prod-env verification
- [Verify rate-limit partitions](verify-rate-limit-partitions.md) — use X-Forwarded-For (trusted from loopback) to separate per-IP vs per-recipient throttle 429s
- [Research tooling sub-agent fallback](research-tooling-subagent-fallback.md) — no ToolSearch/WebSearch as a sub-agent; use curl, and which gov SPA portals resist scraping
- [Verify prod auth without real SMTP](verify-prod-auth-without-real-smtp.md) — fake SMTP TCP stub + headless Edge CDP to prove magic-link/redirect behavior sans Brevo
- [.NET 10 ForwardedHeaders KnownIPNetworks](dotnet10-forwardedheaders-knownipnetworks.md) — KnownNetworks is obsolete (ASPDEPR005); use KnownIPNetworks + fully-qualified System.Net.IPNetwork
- [Verify Stripe webhooks without the CLI](verify-stripe-webhook-without-cli.md) — hand-sign fixtures with Python HMAC; match the api_version Stripe.net expects or ConstructEvent throws a misleading "signature" error
- [NuGetAuditSuppress is per-project](nugetauditsuppress-per-project-scope.md) — suppressing in the package's owning project doesn't silence NU1903 in consuming projects that pull it in transitively
- [Verify concurrency race needs multiprocess](verify-concurrency-race-needs-multiprocess.md) — bash `&`/Python threading aren't tight enough to hit a DB-lock race window; use multiprocessing.Barrier + pre-connected sockets
- [Minimal genuine image fixtures for sniffing](minimal-genuine-image-fixtures-for-sniffing.md) — hand-build real JPEG/PNG/WebP byte headers (no imaging lib) for magic-byte unit tests
- [Dev magic-link token for curl](dev-magic-link-token-for-curl.md) — Development env skips SMTP entirely; devLink comes back in the API response, consume route is `/api/auth/consume`
