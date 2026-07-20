---
name: loading-state-untested-in-store-suites
description: Store loading/failed state-machine suites assert only terminal state — the in-flight 'loading' transition is routinely untested; check that deleting the loading assignment would redden something
metadata:
  type: feedback
---

Every `useSpacesStore.*.test.ts` suite added so far (`flush`, `hydrate`) awaits the
action and asserts the settled result. The in-flight `'loading'` transition — usually
the headline requirement of the task (B-18 FR-1: "the empty state never flashes") —
ends up guarded only by the manual browser drive.

**Why:** an all-green suite reads as "the state machine is covered", but deleting the
`status = 'loading'` assignment leaves it green. Same trap as
[[verify-claims-vs-test-count]]: count the tests, then ask which edit reddens each.

**How to apply:** on any loading/failed/empty three-state review, check for a case
that holds the promise open (`mockReturnValueOnce(new Promise(...))`, assert the
loading getter, then resolve). Also check `reset()` clears the status — it is usually
its own tech task and usually untested. Rate it Minor, not Major, when a manual drive
covered the same ground.
