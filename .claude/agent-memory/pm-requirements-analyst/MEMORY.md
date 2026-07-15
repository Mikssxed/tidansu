# Memory index

- [Plan limits](plan-limits.md) — Free/Pro caps + paywall reasons; the core gate to apply to content/capability features
- [Auth model](auth-model.md) — passwordless magic-link; NOT plan-gated; fixed link security (single-use, 15-min, supersede)
- [EU/Poland launch](eu-poland-launch.md) — owner in Poland; prefer EU-hosted/GDPR providers when personal data is processed
- [Billing / Stripe](billing-stripe.md) — Free→Pro sub via Stripe; build(test-mode) vs go-live gate; webhook trust; Stripe-direct baseline
- [Production-readiness sweep](production-readiness-sweep.md) — fail-loud/fail-safe config convention; B-7 vs B-8 scope split; concrete B-7 gaps found
- [Audit scoping (B-8)](security-scalability-audit-b8.md) — audit-type items get a scoping note not FR doc; severity rubric; ≤30 LOC inline-fix threshold
- [LIGHT-path small-follow-up scoping (B-9/B-10)](webhook-hardening-b9.md) — short-note pattern for guard-adds & event-handler-adds on existing endpoints; B-9 thresholds; per-IP rate-limit question
- [Dependency-bump scoping (B-11)](dependency-bump-b11.md) — short-note pattern for pure version-bump maintenance items; confirmed direct/transitive status of the 3 NU1903 packages
- [Race-condition hardening scoping (B-12)](race-condition-hardening-b12.md) — short-note pattern for concurrency/atomicity fixes on plan-gating surfaces; recommend identical UX for race-lost requests
- [Content-validation cap scoping (B-13)](content-validation-caps-b13.md) — when a fix needs invented new caps/formats (no DB/business precedent), use full FR doc not a short note; ground values via DbContext HasMaxLength grep + frontend producer grep
- [Usage-counts projection scoping (B-14)](usage-counts-projection-b14.md) — short-note pattern for read-path perf fixes with no behaviour change; confirmed 3-call-site scope for shared UsageDto.From pattern
