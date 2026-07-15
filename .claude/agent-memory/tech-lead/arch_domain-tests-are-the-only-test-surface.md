---
name: arch-domain-tests-are-the-only-test-surface
description: tests/Tidansu.Domain.Tests is the repo's ONLY automated test project — pure business rules belong in Domain/Constants (PlanPolicy pattern) so they become testable
metadata:
  type: project
---

`tests/Tidansu.Domain.Tests` (xUnit, references Domain only) is the **single**
automated test project in this repo. There is no Application/API/frontend test
suite; everything else is verified by `dotnet build` + `npm run build` + driving
the app by hand.

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
