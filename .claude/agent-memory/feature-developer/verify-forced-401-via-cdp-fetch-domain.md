---
name: verify-forced-401-via-cdp-fetch-domain
description: Force a specific API route to fail (e.g. a 401) in the real running SPA using CDP's Fetch domain, instead of corrupting client-side auth state
metadata:
  type: feedback
---

To behaviourally prove a frontend error/retry state (e.g. B-18's hydrate
loading/failed/retry machine) against a *specific* backend route failing — without
touching the app's own auth/session state — drive headless Edge via CDP (see
[[verify-frontend-isolated-harness]] for the base launch/WebSocket-driver recipe) and
add the `Fetch` domain:

- `Fetch.enable` with `patterns: [{ urlPattern: '*/api/spaces*' }]` (or whatever route),
  then on each `Fetch.requestPaused` event either `Fetch.fulfillRequest` with a fake
  status/body (e.g. 401 JSON) when a toggle is on, or `Fetch.continueRequest` to pass
  it through untouched. A simple in-closure boolean flag toggled between test phases
  (`setBlockSpacesGet(true/false)`) reproduces "network blip now, back online later"
  without ever touching `localStorage`.
- **Why not corrupt the stored JWT instead:** `useAuthStore`'s `tokens` ref only loads
  from `localStorage` once, at store construction. Overwriting `localStorage` from an
  `evaluate()` call does **not** update the already-running Pinia store's reactive
  state — you'd need a full page reload for it to take effect, which conflates "token
  became invalid mid-session" with "page reloaded with a bad token" and complicates
  testing the in-SPA Retry-button click path specifically. Fetch-domain interception
  lets you fail one call, click the real Retry button in the live DOM, and confirm it
  re-fires the real request — the actual FR-4 "retry re-attempts the real fetch" claim.
- **Also learned:** `useSessionStore` (unlike a plain "current view" store) *does*
  persist the signed-in user's profile to `localStorage` (`tidansu_session`), separate
  from `useAuthStore`'s tokens. Reusing the same Edge `--user-data-dir` across multiple
  script runs means a later "fresh sign-in" navigation to a *different* email's
  magic-link can silently no-op — the router's `guestOnly` guard sees the old
  persisted `session.isAuthenticated === true` and redirects away from `/login` before
  `onMounted`'s `consumeToken` ever runs, so the UI shows the *previous* run's account.
  Use a fresh `--user-data-dir` per distinct-identity test, or don't rely on the
  "signed in" step actually being a new account if the profile dir is reused.
- CDP's `Page.navigate` doesn't itself wait for the SPA to render — wrap it so the
  caller can choose `waitMs=0` and screenshot after a short manual sleep (~40ms) to
  actually catch a fast-resolving loading frame; the default ~2s wait is fine for
  "let it settle" calls but will always miss a spinner that resolves before that.
- **Narrow the `urlPattern` past the loose `*/api/spaces*` example above under Vite
  dev.** The unbundled dev server serves TS module source over HTTP at paths that
  literally contain the API route string (e.g.
  `/src/api/apiClient/api/spaces/index.ts`, `.../item/zones/index.ts`). A pattern
  that only requires the substring `/api/spaces` anywhere in the URL intercepts those
  module fetches too; fulfilling them with a fake JSON 401 body corrupts the module
  graph and blanks the whole app (`#app` mounts with zero children, no console error,
  no exception event — looks like a silent full-app crash, not an API failure). Use
  patterns anchored on what only the real endpoint has: an exact suffix
  (`*/api/spaces` for the bare collection route) or a query-string marker
  (`*/api/spaces?page=*` for a paginated GET) — never a bare `*/segment*` wildcard
  against a route name that could also appear in a source file path.
