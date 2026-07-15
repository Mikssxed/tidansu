---
name: sp-getapplock-return-code-check
description: sp_getapplock silently fails open on timeout unless its return code is captured — re-check on any app-lock/atomic-cap change
metadata:
  type: feedback
---

When reviewing any `sp_getapplock`-based atomic path (introduced in B-12 for the Free
space-cap race, `SpacesRepository.AddWithinSpaceCapAsync`), verify the **stored-proc return
code is captured and checked**, not discarded.

**Why:** `sp_getapplock` signals outcome via its return code, NOT by raising an error:
`0`/`1` = granted, `-1` = timeout, `-2` = cancelled, `-3` = deadlock victim, `-999` = other.
On `@LockTimeout` expiry it returns `-1` **without throwing**. If the call runs via
`ExecuteSqlInterpolatedAsync($"EXEC sp_getapplock …")` and ignores the result, a timeout
falls through to the re-count + insert **without holding the lock** — the serialization
guarantee (and the plan-limit protection built on it) silently fails open. This contradicts
the common (wrong) assumption that "a lock timeout surfaces as a 500."

**How to apply:** Flag as 🟠 Major any `sp_getapplock` call whose return value is not read
and branched on (`< 0` → roll back + fail closed). Correct pattern captures it, e.g.
`DECLARE @res int; EXEC @res = sp_getapplock …; SELECT @res` via `.SqlQuery<int>(...)`.
This is a code-level edge path a concurrency drive cannot reveal (the lock is held only for
one insert, so the 5 s timeout is practically never hit under test). Cross-references the
security-reviewer's fail-open axis — capturing the code fixes both, so a one-line note there
is enough; own it as a correctness finding. See [[workflow-uncommitted-multitask-worktree]].
