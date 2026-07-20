---
name: arch-domain-tests-are-the-only-test-surface
description: Two test surfaces — tests/Tidansu.Domain.Tests (xUnit, backend) and a frontend vitest suite (npm test); pure business rules belong in Domain/Constants (PlanPolicy pattern) so they become testable
metadata:
  type: project
---

**Corrected 2026-07-20 (B-18): there are TWO test surfaces, not one.**

1. `tests/Tidansu.Domain.Tests` (xUnit, references Domain only) — the sole *backend*
   test project. No Application/API/integration/E2E suite exists.
2. **The frontend has a vitest surface**: `npm test` → `vitest run` from
   `src/Tidansu.App`, with `src/stores/useSpacesStore.flush.test.ts` as the exemplar
   (mocks `useApiClient` / `useSpacesApi` / `useLimits` / `@/queryClient` at the module
   boundary, drives the Pinia store directly via `setActivePinia(createPinia())`).
   I previously recorded this as non-existent — wrong; don't plan around that again.

**When to plan a frontend vitest file** (it is the exception, not the default —
everything else is still `npm run build` + a manual drive): the criterion is
data-integrity shaped *and* depends on a timing/rejection interleaving that a browser
drive can't hit reliably. Precedents: B-15's debounce/flush ordering; B-18's "a failed
hydrate must not seed a phantom starter fridge."

**Why:** this makes "where does a pure business rule live?" a testability decision,
not just a layering one. A rule expressed as a FluentValidation lambda in
Application, or inline in a handler, is **untestable** in this repo. The same rule
as a pure static class in `Domain/Constants/` gets table-driven `[Theory]` coverage
for free.

**How to apply:** when planning a pure decision (plan caps, photo acceptance, any
"inputs in → reason-or-null out" rule), put it in `Domain/Constants/` following the
`PlanPolicy` shape — pure, static, no DI, no EF, reason enum/string out — and plan a
matching `*Tests.cs` in `tests/Tidansu.Domain.Tests`. Keep the Application layer
(validator/handler) as a **thin adapter** that calls it. Precedents: `PlanPolicy` +
`PlanPolicyTests`; B-13's `PhotoPolicy` + `PhotoPolicyTests`.

**Testability does not depend on the caller — I got this wrong once, don't repeat it.**
On B-13 I argued that moving a check out of a FluentValidation rule and into a handler
would "cost the Domain test surface." That was wrong, and the human pushed back
correctly. A pure function is testable regardless of who calls it: `PlanPolicyTests`
tests `PlanPolicy` directly and never constructs a handler, even though handlers are
its only production callers. **The Domain/adapter split is what buys testability; where
the adapter lives is a separate, free choice.** So argue adapter placement on its real
merits (response-code ordering, lock scope, error-key construction) — never on testability.

Corollary: **validation runs before the handler.** FluentValidation sits in the MediatR
pipeline, so a validator 400 preempts any plan gate (403) in the handler — which is
exactly why a plan-gated field's check belongs in the handler. See
[[validation-preempts-plan-gate-403]].
