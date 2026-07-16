# Security-reviewer memory index

- [Confirmed auth/magic-link protections](confirmed-magic-link-protections.md) — verified controls on the magic-link path; don't re-flag these.
- [High-risk files](high-risk-files.md) — files that concentrate auth/secret/redirect risk; read these for any auth-adjacent change.
- [Confirmed billing protections](confirmed-billing-protections.md) — verified Stripe webhook-trust controls (B-6); the WebhookSecret guard gap to re-check.
- [Confirmed photo-validation protections](confirmed-photo-validation-protections.md) — verified B-13 photo controls + the accepted polyglot residual and its B-16 trigger.
- [Recurring gaps](recurring-gaps.md) — patterns that keep surfacing across reviews.
- [Confirmed protections — spaces path](confirmed-protections-spaces.md) — traced-to-ground protections in Spaces/zones/items; don't re-flag these
- [Recurring gaps in Tidansu](recurring-gaps-tidansu.md) — client-supplied global PKs, unbounded collection fields, size limits lost on endpoint splits
