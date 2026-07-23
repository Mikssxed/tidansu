---
name: verify-headless-edge-cdp-remote-allow-origins
description: python websocket-client CDP connections to headless Edge get a 403 handshake unless launched with --remote-allow-origins
metadata:
  type: feedback
---

Driving headless Edge over CDP from a **Python** script (`pip install
websocket-client`, not Node's built-in `WebSocket` used in
[[verify-frontend-isolated-harness]]) gets a `403 Forbidden` handshake —
`Rejected an incoming WebSocket connection from the http://localhost:<port> origin`
— even though `curl http://localhost:<port>/json/version` works fine and returns a
valid `webSocketDebuggerUrl`.

**Why:** newer Edge/Chrome DevTools enforces an origin allowlist on the CDP
WebSocket itself; recent-enough Edge/Chromium requires the launch flag
`--remote-allow-origins=*` (or a specific origin) for any WebSocket client that
doesn't set the exact `Origin` header the browser expects. `curl` against the HTTP
`/json/*` endpoints is unaffected — only the WebSocket upgrade is checked, so the
failure only shows up once you try to actually drive the page.

**How to apply:** launch with `--headless --disable-gpu --remote-debugging-port=<p>
--remote-allow-origins=* --user-data-dir=<temp>`. Full multi-step SPA drive recipe
that worked end-to-end for B-25 (auth without a UI login flow, dashboard state
assertions, and a real click-through delete): navigate to any page on the app's
origin first (e.g. `/login`), `Runtime.evaluate` to `localStorage.setItem` both
`tidansu_auth` (`{accessToken, refreshToken, expiresAt}` — refreshToken can be a
dummy string if nothing triggers a refresh during the drive) and `tidansu_session`
(`{user:{name,email,plan}, syncOn, cancellationScheduled, proAccessUntil}`), then
`Page.navigate` to the real destination route (e.g. `/spaces`) so `App.vue`'s boot
hydrate runs with the tokens already present — no login UI interaction needed. DOM
assertions and further clicks (`el.click()` on a real button found via
`querySelector`) work exactly like a user would, since Vue listens for standard DOM
`click` events.

**CDP `Page.navigate` is a full browser reload, not an SPA route change** (B-25
follow-up, verifying a "no reload" acceptance bar for a store-watch fix). If the
thing under test is that a Vue Router client-side navigation must **not** trigger
a fresh `hydrate()`/full remount, driving the "go to another route" step with
`Page.navigate` silently defeats the test — it reloads the page for real, so stale
state would look fixed either way. Instead find and `.click()` a real in-app
`<a href="...">`/`RouterLink`-rendered anchor or nav button (e.g.
`document.querySelector('a[href="/account"]')`) — Vue Router intercepts that click
and does an in-page navigation, exercising the same code path a real user's click
would.
