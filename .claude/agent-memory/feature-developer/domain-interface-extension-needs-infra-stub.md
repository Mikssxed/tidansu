---
name: domain-interface-extension-needs-infra-stub
description: extending a Domain repository interface in an isolated batch (before the Infrastructure implementation task lands) breaks the whole-solution build unless you add placeholder implementations
metadata:
  type: feedback
---

When a tech-tasks.md batch scopes a run to "Domain layer only" but includes a task
that adds members to a repository interface (e.g. `ISpacesRepository`), the
concrete Infrastructure implementer (e.g. `SpacesRepository`) will fail to compile
the instant those members exist — C# has no way to add an interface member without
every implementer either implementing it or the build breaking. This happened on
B-15's T-1..T-7 batch: T-5 extended `ISpacesRepository` with granular per-entity
methods, but the real implementation is T-15/T-16, explicitly out of scope for that
run.

**Resolution used (validated — build stayed green, no complaint from the task
author):** add throwing `NotImplementedException` placeholder bodies for the new
members directly in the Infrastructure class, with a comment naming which future
task will replace them and noting they're unreachable (no Application-layer caller
exists yet). Leave the *real* implementation's own tech-task checkbox unchecked.

**Why:** the "dotnet build green, whole solution" gate is non-negotiable per
`CLAUDE.md`'s Definition of Done, and it is checked even when a task instruction
scopes the work to "one layer." Silently leaving the build red to stay literally
within a layer boundary is not an acceptable trade — a clearly-labeled, temporary,
unreachable stub is.

**How to apply:** any time a task batch adds/changes a Domain repository interface
signature without also including its Infrastructure implementation task in the same
batch, add minimal placeholder bodies in the concrete class so the solution
compiles, comment them with the deferred task id, and do not check off the
implementation task itself. Mention this explicitly in the final report — it's an
architectural consequence the task plan may not have anticipated, not a silent
scope change.
