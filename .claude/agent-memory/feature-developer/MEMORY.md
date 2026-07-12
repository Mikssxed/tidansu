# Memory index

- [Verify frontend via isolated harness](verify-frontend-isolated-harness.md) — drive a Vue leaf component without the backend using a Vite harness + headless Edge over CDP
- [Verify Production-like backend drives](verify-prod-env-drives.md) — env vars, readiness polling (swagger is dev-only), and fast SMTP-fail setup for prod-env verification
- [Verify rate-limit partitions](verify-rate-limit-partitions.md) — use X-Forwarded-For (trusted from loopback) to separate per-IP vs per-recipient throttle 429s
- [Research tooling sub-agent fallback](research-tooling-subagent-fallback.md) — no ToolSearch/WebSearch as a sub-agent; use curl, and which gov SPA portals resist scraping
