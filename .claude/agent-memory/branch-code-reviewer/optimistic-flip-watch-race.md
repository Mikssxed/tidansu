---
name: optimistic-flip-watch-race
description: Any watch on useSessionStore state (plan, syncOn) fires on the OPTIMISTIC flip — refetches it triggers race the server commit; check every new session-watch trigger
metadata:
  type: project
---

`useSessionStore.setPlan`/`setSync` mutate state *before* awaiting the server
(`useSessionStore.ts` — optimistic flip at the top, reconcile in `.then`). Any
`watch(() => session.plan, ...)` in another store therefore fires while the POST is
still in flight; a GET it triggers can be served pre-commit data, and in the
direct-apply plan shape (branch c) the watched value never changes again — no
corrective trigger. Found as B-25 review M1 (`refreshOverCapFlags` downgrade race).

**Why:** the Stripe production path masks it (immediate downgrade = scheduled cancel,
real flip arrives later via `AuthResponse`), so manual verification (V-3) can pass on
timing luck while the dev/direct path is a coin flip.

**How to apply:** whenever a diff adds a watch/effect keyed to session-store state
that fires a server request, ask "is the watched value flipped optimistically?" If
yes, require a settlement-keyed trigger (epoch ref bumped in then/catch) alongside or
instead of the watch. Generalized rule now in `.claude/context/patterns.md` (Frontend
gotchas); related: [[hydrate-caller-overlap-premise]] (epoch guards over early-returns).
