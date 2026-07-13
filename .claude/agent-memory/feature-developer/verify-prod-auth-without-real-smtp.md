---
name: verify-prod-auth-without-real-smtp
description: Drive prod-like magic-link/auth-redirect proofs without a real Brevo/SMTP account, using a raw-socket fake SMTP stub + headless Edge over CDP
metadata:
  type: feedback
---

Verifying auth-adjacent behaviour (FR-8/FR-9-style: dev-file inert, no dev-link
leak, SMTP-failure error shape, auth-redirect enforcement) under
`ASPNETCORE_ENVIRONMENT=Production` when no real Brevo/SMTP account is available.

**Why:** B-4/B-6-style tasks are "code-complete, owner-action-pending" — you can
prove the *code* is prod-safe without a live mail provider, but a plain "SMTP
Host=localhost:1" test only proves the *failure* path (connection refused). To see
the **success** path's response shape (e.g. confirm `devLink` is `null` in a real
`200 OK`, not just absent from an error body), the send must actually succeed.

**How to apply:**
- Write a ~50-line raw TCP socket script (Python `socket`/threading is enough) that
  speaks just enough SMTP to return `220`/`250`/`354`/`250 OK` for
  `EHLO/AUTH/MAIL FROM/RCPT TO/DATA/.` — no real delivery, but `FluentEmail`'s
  `SmtpClient` sender considers the send successful. Point
  `SmtpSettings__Host=127.0.0.1`, `Port=<stub port>`, `EnableSsl=false` at it.
  Python's built-in `smtpd` module is gone in 3.12+ and `aiosmtpd` usually isn't
  installed — don't reach for either, hand-roll the stub instead.
- This unblocks a **real** `200 OK` response body to inspect (e.g.
  `{"data":{"devLink":null},...}`), not just the error-path proof.
- For "does the built SPA actually redirect unauthenticated visitors to `/login`"
  (can't be curl-verified — needs JS execution): headless Edge is on this machine
  (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`), no
  Playwright/chromium-cli installed. Launch
  `--headless=new --remote-debugging-port=9222 --user-data-dir=<temp>`, fetch
  `http://localhost:9222/json/version` for the ws URL, drive it with a hand-rolled
  CDP client over Node's global `WebSocket` (Node 22+): `Target.createTarget` +
  `attachToTarget{flatten:true}`, `Page.enable`/`Runtime.enable`, `Page.navigate`,
  wait ~2.5s for the SPA/router to settle, then `Runtime.evaluate` on
  `window.location.href` and `document.body.innerText` to confirm the redirect
  and rendered view — cheaper than the full harness in
  [[verify-frontend-isolated-harness]] since there's no component to mount, just a
  route to hit.
- **Cleanup matters**: background `dotnet`/`msedge`/stub-server processes started
  with `&` in this shell often survive a `kill %1` (job control isn't reliable
  across tool-call boundaries here) — after each prod-like boot, check
  `Get-NetTCPConnection -LocalPort <port>` via PowerShell and
  `Stop-Process -Id <owning pid> -Force` explicitly; don't assume the bash `kill`
  worked. Also delete the day's rolled Serilog file
  (`Logs/Tidansu-Api-<date>*.txt`) afterward so test noise doesn't linger in the
  repo's gitignored-but-locally-visible log directory.
- See [[verify-prod-env-drives]] for the base prod-like-boot env-var recipe this
  builds on, and [[verify-rate-limit-partitions]] for the sibling per-IP/per-
  recipient throttle technique.
