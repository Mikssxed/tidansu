# Memory index

- [Config fail-loud & secret logging](arch_config-fail-loud-and-secret-logging.md) — prod-only startup guards (JWT/SMTP/Stripe/FrontendUrl/DB); forwarded-header proxy trust must be env-driven never wildcard; creds/links never in logs
- [Email / magic-link delivery seam](email-magic-link-delivery-seam.md) — IEmailService + FluentEmail SMTP, dev-file vs prod-send; a delivery-only change needs no Kiota/frontend
- [Billing / Stripe webhook trust seam](billing-stripe-webhook-trust-seam.md) — free-Pro prod leak, webhook=sole Pro authority, atomic idempotency, downgrade read-only already in PlanPolicy
- [ErrorHandlingMiddleware masks 4xx](arch_errorhandling-middleware-masks-4xx.md) — generic catch turns Kestrel BadHttpRequestException (413/400) into 500; RequestSizeLimit needs an explicit catch clause
- [Dep-bump AutoMapper/Swashbuckle traps](dep-bump-automapper-swashbuckle-traps.md) — AutoMapper advisory forces licensed v15 (product-gated); Swashbuckle+OpenApi+Kiota-CLI move in lockstep
- [Plan-cap check-then-insert race](arch_plan-cap-check-then-insert-race.md) — non-atomic cap gate; fix = sp_getapplock re-count-in-lock (per-user for spaces, per-space for zones/items), not a DB constraint
- [Plan-gate decomposition algebra](arch_plan-gate-decomposition-algebra.md) — whole-graph gate → per-mutation: adds reduce to `count >= cap`, updates/deletes get no gate; the two photo-transition traps
- [Two test surfaces: Domain xUnit + frontend vitest](arch_domain-tests-are-the-only-test-surface.md) — Domain.Tests for pure rules; `npm test` vitest for store timing/data-integrity cases (flush, hydrate)
- [Read-path projection fixes](read-path-projection-fixes.md) — aggregate in memory not SQL (Max-over-empty → NULL throws); prove with the dev-only EF SQL log, not correct numbers (B-14, B-16)
- [Validation preempts the plan-gate 403](validation-preempts-plan-gate-403.md) — FluentValidation runs before handlers, so a 400 beats the paywall 403 on plan-gated fields; empty-string photo counts as a photo
- [Shared DTO + full-replace = silent field wipe](shared-dto-full-replace-wipe.md) — narrowing a read that shares its DTO with a full-replace update handler wipes the dropped field on next edit; fix = write patch semantics (`is not null`), not a DTO split (B-16 photo TRAP)
- [Paywall vs generic error surfacing](frontend_paywall-vs-generic-error-surfacing.md) — raise a generic "didn't save" surface only inside the existing `else` of `planReasonOf`; structural exclusivity, not a second check (B-19)
- [Space-scoped Zone/Item keys](arch_space-scoped-zone-item-keys.md) — no Item→Zone FK exists (don't add one); key widening can't fail on existing data; bare-id lookups stop being accidentally safe (B-22)
- [Frontend downgrade read-only seam](frontend_downgrade-readonly-seam.md) — over-cap read-only is a UI-only gate: computed in useLimits (slice store.spaces by cap, stable Id order), gated at the view layer not the store; server enforcement is a separate follow-up (B-17)
- [Root-entity id can't be composite-keyed](arch_root-entity-id-cannot-be-composite-keyed.md) — Space is the FK principal so B-22's (SpaceId,Id) doesn't transfer; server-assign the id (CSPRNG), no migration. Traps: FR-6 optimistic-add reconcile + UseRateLimiter-before-auth (B-23)
- [Server over-cap read-only gate](arch_server-overcap-readonly-gate.md) — B-24 whole-space gate ≠ count caps; B-25 server-sent IsOverCap; B-26 SpaceReadDto split + guard deepened to IsSpaceOverCapAsync (one oracle, four consumers)
</content>
