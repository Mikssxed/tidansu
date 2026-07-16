# Memory index

- [Config fail-loud & secret logging](arch_config-fail-loud-and-secret-logging.md) — prod-only startup guards (JWT/SMTP/Stripe/FrontendUrl/DB); forwarded-header proxy trust must be env-driven never wildcard; creds/links never in logs
- [Email / magic-link delivery seam](email-magic-link-delivery-seam.md) — IEmailService + FluentEmail SMTP, dev-file vs prod-send; a delivery-only change needs no Kiota/frontend
- [Billing / Stripe webhook trust seam](billing-stripe-webhook-trust-seam.md) — free-Pro prod leak, webhook=sole Pro authority, atomic idempotency, downgrade read-only already in PlanPolicy
- [ErrorHandlingMiddleware masks 4xx](arch_errorhandling-middleware-masks-4xx.md) — generic catch turns Kestrel BadHttpRequestException (413/400) into 500; RequestSizeLimit needs an explicit catch clause
- [Dep-bump AutoMapper/Swashbuckle traps](dep-bump-automapper-swashbuckle-traps.md) — AutoMapper advisory forces licensed v15 (product-gated); Swashbuckle+OpenApi+Kiota-CLI move in lockstep
- [Plan-cap check-then-insert race](arch_plan-cap-check-then-insert-race.md) — non-atomic cap gate; fix = sp_getapplock re-count-in-lock (per-user for spaces, per-space for zones/items), not a DB constraint
- [Plan-gate decomposition algebra](arch_plan-gate-decomposition-algebra.md) — whole-graph gate → per-mutation: adds reduce to `count >= cap`, updates/deletes get no gate; the two photo-transition traps
- [Domain tests are the only test surface](arch_domain-tests-are-the-only-test-surface.md) — tests/Tidansu.Domain.Tests is the repo's sole test project; pure rules go in Domain/Constants (PlanPolicy shape) to be testable at all
- [Read-path projection fixes](read-path-projection-fixes.md) — aggregate in memory not SQL (Max-over-empty → NULL throws); prove with the dev-only EF SQL log, not correct numbers (B-14, B-16)
- [Validation preempts the plan-gate 403](validation-preempts-plan-gate-403.md) — FluentValidation runs before handlers, so a 400 beats the paywall 403 on plan-gated fields; empty-string photo counts as a photo
</content>
