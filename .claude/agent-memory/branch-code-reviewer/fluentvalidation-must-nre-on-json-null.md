---
name: fluentvalidation-must-nre-on-json-null
description: FluentValidation `.Must()` on a collection/reference DTO property NREs into a 500 on explicit JSON null — the `= []` initializer does not protect. Check every new validator.
metadata:
  type: feedback
---

When reviewing a new `AbstractValidator<TDto>`, check every `.Must(x => x.Something)`
and `.Must(x => x.Count …)` on a **reference/collection** property for an explicit-JSON-null
NRE → 500.

**Why:** the DTO's `= []` / `= null!` initializer only covers an *omitted* key.
`System.Text.Json` writes an explicit `null` straight over it, and this repo does **not**
opt into `RespectNullableAnnotations` (`WebApplicationBuilderExtensions.cs` configures only
`JsonStringEnumConverter`), so the property really is null at validation time.
FluentValidation invokes the `Must` predicate regardless of null and does not catch
exceptions from it → NRE escapes `ValidationBehavior` → `ErrorHandlingMiddleware`'s
catch-all → **500**. Found in B-13 (`ItemDtoValidator` `Tags` rule, `.Must(tags => tags.Count <= …)`).

**How to apply:**
- `RuleForEach(...)` is *safe* (FV null-guards collection rules). Bare `MaximumLength` is
  *safe* (skips nulls). Only `.Must` / custom predicates are exposed. Don't flag the safe ones.
- Fix is `.NotNull()` before `.Must(...)` — also yields a clean field-attributed key.
- Handlers have the same shape: `dto.Zones.Count` / `dto.Items.Count` in
  `CreateSpaceCommandHandler` NRE on `"zones": null`. Pre-existing, but call it out when
  the task's own AC is "clean 400, not a 500".
- Severity: Major, not Critical — reachable only from a hand-crafted request (the SPA's
  `spaceMapping.ts` normalises with `?? []`), and usually pre-existing rather than a regression.
  Say so rather than inflating.

Related: [[verify-claims-vs-test-count]]
