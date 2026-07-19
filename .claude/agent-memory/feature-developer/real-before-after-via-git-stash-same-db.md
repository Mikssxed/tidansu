---
name: real-before-after-via-git-stash-same-db
description: When a task needs a measured before/after payload comparison and the change is still uncommitted, git stash the whole diff (incl. untracked new files), rebuild, measure against the SAME seeded DB, then stash pop — gives a real number instead of an estimate, with no schema drift risk if no migration was added.
metadata:
  type: feedback
---

For B-16's FR-9 ("measured before/after, not assumed" — 3 spaces × 20 photo items × ~1.5 MB
each), the tech-plan hedged with a fallback ("measure an equivalent full-graph read and reason
explicitly") for when a true before/after is impractical. It was not impractical here — the
whole B-16 diff was still uncommitted working-tree changes, and the task made no EF migration
(no schema change), so the exact same LocalDB could serve both the old and new code without any
migration/rollback risk.

**How to apply:**
1. Seed the benchmark data via the API against the **current (after)** code first, and measure
   the after-response.
2. Stop the running server. `git stash push -u -m "<label>"` — the `-u` is required to also
   stash **new untracked files** (new DTOs/handlers a feature adds), not just modified tracked
   ones; without it the pre-change tree still contains the new types and won't build/behave as
   the true "before".
3. `dotnet build` (confirm it's still green pre-change), restart the server against the
   **unchanged DB**, hit the same endpoint with the same auth token, measure raw bytes
   (`curl -w '%{size_download}'`).
4. Stop the server, `git stash pop`, confirm `git status` matches the pre-stash diff exactly,
   rebuild, restart for the rest of the verification pass.

**Why:** this gives a real measured number tied to the actual pathological data (not a
back-of-envelope estimate), and reuses the same seeded rows for both sides — no need to
re-seed or reconstruct "what the old JSON would have looked like" by hand. It only works
cleanly when (a) the diff is still uncommitted (or you're willing to `git checkout` a prior
commit) and (b) no migration separates the two schemas — both were true for B-16 and are worth
checking before reaching for this technique on a future slice.

Related: [[verify-prod-env-drives]] (readiness polling pattern reused here), the FR-9 result
itself is recorded in `docs/active/tasks/B-16-slim-spaces-list/task.md`'s Notes (120,418,315
bytes before vs 968 bytes after, same account/DB).
