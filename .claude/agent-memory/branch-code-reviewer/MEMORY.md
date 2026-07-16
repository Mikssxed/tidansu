# Memory index

- [No-hex / token rule scope](convention-no-hex-scope.md) — pixel bracket sizes and backend email hex are NOT frontend-token violations; avoid false positives
- [Email delivery failure path](email-delivery-failure-path.md) — B-4 fail-loud/secret-safe email invariants to re-check on future email changes
- [Billing webhook review checks](billing-webhook-review-checks.md) — two silent Stripe-webhook failure modes (config-guard completeness, idempotency-claim transaction boundary) to re-check on billing changes
- [Forwarded-header wildcard guard checks](forwarded-header-wildcard-guard-checks.md) — `::/0` IPv6 wildcard + malformed-value message gaps to re-check when the ForwardedHeaders trust binding changes
- [Uncommitted multi-task worktree](workflow-uncommitted-multitask-worktree.md) — changes often sit unstaged on `main` with several tasks intermixed; reconstruct per-task diff, flag cross-task hunks as scope
- [NuGetAuditSuppress per-project](nugetauditsuppress-per-project.md) — suppressions duplicated across csproj files is correct (per-project audit), not a DRY violation; must be advisory-ID-scoped
- [sp_getapplock return-code check](sp-getapplock-return-code-check.md) — app-lock silently fails open on timeout unless its return code is captured; Major finding on atomic-cap/lock changes
- [FluentValidation .Must NRE on JSON null](fluentvalidation-must-nre-on-json-null.md) — `= []` initializers don't stop STJ writing explicit null; `.Must(x => x.Count)` → 500. Check every new validator
- [Verify claims vs test count](verify-claims-vs-test-count.md) — "N/N green" can hide tautological tests; ask what edit would make each new test go red
- [Corroborating manual observation claims](corroborating-manual-observation-claims.md) — "I read the SQL log" is checkable: look for detail the plan couldn't have supplied (real table names vs the plan's idealized text)
- [Optimistic rollback review checks](optimistic-rollback-review-checks.md) — two silent-data-loss shapes in the store flush: snapshot Object.assign stomping child arrays; cascade delete racing reassignment updates
- [Empty fixtures hide rollback bugs](empty-fixtures-hide-rollback-bugs.md) — a green test over `zones: []`/`items: []` proves nothing about code that copies those arrays; read the fixture builder
