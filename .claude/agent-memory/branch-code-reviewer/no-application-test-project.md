---
name: no-application-test-project
description: tests/ contains only Tidansu.Domain.Tests (Domain-only reference), so validators and handlers ship with zero coverage — build a throwaway console probe to test them yourself rather than reasoning about behaviour.
metadata:
  type: project
---

`tests/` holds exactly one project, `Tidansu.Domain.Tests`, and its only `ProjectReference` is
`Tidansu.Domain`. There is **no Application test project**, so every `AbstractValidator`,
MediatR handler, and `PlanPolicy` interaction ships verified only by manual/driven evidence.

**Why:** it means "the plan says the rule works" is never backed by a test I can run, and the
inline evidence notes in `tech-tasks.md` are the only claim. In B-22 both Major findings
(ordinal-vs-CI duplicate check, `.Must` NRE on JSON null) lived in a brand-new validator and
were invisible to every existing check including `dotnet build`.

**How to apply:** when a diff adds validator or handler logic, spend the ~2 minutes to build a
throwaway console app in the scratchpad with a `ProjectReference` to `Tidansu.Application` and
call `new SomeValidator().Validate(dto)` on the real shipped code. It is far more conclusive
than reading FluentValidation semantics off memory, and it's how I confirmed both that
`DependentRules` *does* short-circuit (a claim the plan made, which held) and that the
duplicate-id rule *doesn't* cover case-differing ids (a claim the plan made, which didn't).
`sqlcmd -S "(localdb)\MSSQLLocalDB" -d TidansuDb` is available for the DB half.

Recommending a `Tidansu.Application.Tests` project as a follow-up is reasonable, but note it as
tech debt in Architecture Notes — don't inflate its absence into a finding against the diff.

Related: [[collation-vs-ordinal-uniqueness-checks]], [[verify-claims-vs-test-count]],
[[corroborating-manual-observation-claims]]
