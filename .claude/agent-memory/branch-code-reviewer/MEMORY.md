# Memory index

- [No-hex / token rule scope](convention-no-hex-scope.md) — pixel bracket sizes and backend email hex are NOT frontend-token violations; avoid false positives
- [Email delivery failure path](email-delivery-failure-path.md) — B-4 fail-loud/secret-safe email invariants to re-check on future email changes
- [Billing webhook review checks](billing-webhook-review-checks.md) — two silent Stripe-webhook failure modes (config-guard completeness, idempotency-claim transaction boundary) to re-check on billing changes
