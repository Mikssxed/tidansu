---
name: batched-task-lists-can-leave-api-red-between-runs
description: In this repo's tech-tasks.md batching scheme, a task that deletes an Application-layer command can be scheduled before the controller task that stops calling it — dotnet build on the whole solution goes red at exactly (and only) that controller until the later task lands. Expected, not a bug to silently fix.
metadata:
  type: feedback
---

B-15's `tech-tasks.md` scheduled T-14 (delete
`Application/Spaces/Commands/UpdateSpace/`) in the same run as T-10/T-11/T-12, but
explicitly deferred T-18 (the controller change that stops calling the deleted
command) to a later batch — the task brief said outright "you are not writing the
controller — that's T-18" and pre-warned that "a `dotnet build` failure after
T-14/T-8 most likely means a caller you didn't expect — report it, don't force it".

**What happened:** deleting `UpdateSpace/` broke only `Tidansu.API`'s build
(`SpacesController.cs` still had `using ...Commands.UpdateSpace;` and called
`UpdateSpaceCommand`). `Tidansu.Domain`, `Tidansu.Application`, and
`Tidansu.Infrastructure` all built clean; `dotnet test` on the Domain test project
ran green. Only `dotnet build` on the whole solution (which includes `Tidansu.API`)
showed the one, single, expected error.

**How to apply:** when a task brief explicitly scopes you away from a file (e.g.
"that's T-18, not your job") and a dependency deletion you *are* asked to do breaks
that file's compile, that is the intended, reported state — not a signal to quietly
patch the out-of-scope file to keep the aggregate build green. Verify the break is
narrow and singular (grep the deleted symbol across `src/`, build each project
individually to confirm the blast radius is exactly the deferred file) and report it
plainly rather than either (a) silently fixing it (scope creep) or (b) silently
leaving it unmentioned (DoD says build green, so the gap needs to be surfaced
explicitly). See [[ef-navigation-default-empty-not-null]] for the same session's
other finding-not-fixed judgment call.
