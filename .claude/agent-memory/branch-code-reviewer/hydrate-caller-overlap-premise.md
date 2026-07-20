---
name: hydrate-caller-overlap-premise
description: "'The two hydrate callers cannot overlap' is false — App.vue fires hydrate() whenever hasTokens, so a signed-in user opening a magic link runs both; check this on any spaces-store status/state-machine change"
metadata:
  type: project
---

Plans that add single-ref status state to `useSpacesStore.hydrate` keep asserting the
two callers can't overlap ("boot-with-tokens vs. sign-in-without-tokens"). Verified
false in B-18: `App.vue`'s `onMounted` fires `void spaces.hydrate()` whenever
`auth.hasTokens`, and `useAuth.consume` fires `await spaces.hydrate(true)` — an
already-signed-in user full-page-loading `/login?token=…` runs both while `hydrated`
is still false, and neither has an in-flight guard.

**Why:** any single non-request-scoped status ref (`hydrateStatus`, and anything B-19
adds around `handleSyncError`) is then last-writer-wins — a losing failure can paint
an error panel over successfully loaded data. `reset()`-mid-flight has the same shape:
the pending call's catch re-arms the status after `reset()` cleared it.

**How to apply:** on any change to `hydrate`'s state, ask whether a *superseded* call
can still write. The correct fix is a generation/epoch counter, NOT an in-flight
early-return — `useAuth.consume` awaits `hydrate` and relies on it meaning "spaces are
loaded", so an early return would navigate to an empty dashboard. See
[[loading-state-untested-in-store-suites]].
