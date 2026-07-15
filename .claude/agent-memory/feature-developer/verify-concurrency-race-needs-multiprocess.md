---
name: verify-concurrency-race-needs-multiprocess
description: Driving a real concurrency race (e.g. sp_getapplock/DB-lock serialization) against a local API needs true OS-level parallel senders, not bash `&` or Python threading
metadata:
  type: feedback
---

To behaviourally prove a concurrency fix (e.g. B-12's per-user `sp_getapplock`
race-close on the Free space cap) actually exercises the *raced* branch — not just
"the invariant held" — the fan-out must deliver requests to the server truly
concurrently at the socket level.

**Why:** Against a same-machine LocalDB, a full request round-trip (auth + a cheap
pre-check SELECT + app-lock acquire + re-count + insert + commit) completes in
low single-digit milliseconds. Two "concurrent" senders that aren't *actually*
scheduled in parallel will serialize outside that window and only ever hit the
ordinary/ok branch, never the raced-and-lost branch — even though the fix is
correct. This makes an under-powered test give a false negative for the FR-4-style
"log a distinct signal for the lost race" requirement while the safety property
(never over cap, never 500) still passes.

**How to apply:**
- `curl ... &` background jobs in bash on Windows/git-bash are **not** tight
  enough — each curl is a fresh process with spawn overhead (seen: ~9s gaps
  between "concurrent" requests in the server log). Don't use this for a race test.
- Python `threading.Thread` + `threading.Barrier` is *still not* tight enough by
  itself — the GIL serializes the Python-side work around each socket send, so a
  release-together barrier can still let every request's DB pre-check land
  sequentially outside the raced window (observed: 8/8 threads, only 1 ever
  reached the lock).
- What worked: `multiprocessing.Process` (real OS processes, no shared GIL) +
  `multiprocessing.Barrier`, each process pre-opening its own
  `http.client.HTTPConnection` and calling `.connect()` before waiting on the
  barrier, so only the `.request()`/`.getresponse()` pair happens after release.
  With N≈25 processes this reliably produced multiple genuine race-losers (6 of
  24 rejections hit the in-lock reject branch and logged the distinct warning;
  the other 18 were legitimately rejected earlier by the cheap pre-check).
- To confirm you actually exercised both branches (not just the safety
  invariant), grep the server log for the pre-lock log line (e.g. "Creating
  space X") vs. the distinct in-lock-reject warning, and count them — the count
  of pre-lock log lines for the capped user should exceed 1, and
  (pre-lock-passes − 1) should equal the count of the distinct race-lost
  warning.
- Magic-link/dev-auth flow to script a fresh test user end-to-end: `POST
  /api/auth/magic-link` returns `data.devLink` in Development (query-string
  `token`, URL-encoded — decode it), then `POST /api/auth/consume {"token":
  "<decoded>"}` returns the JWT. In dev with `StripeSettings.Enabled=false`,
  `PUT /api/account/plan {"plan":"pro"}` flips the plan synchronously via
  `DirectBillingService` — no real Stripe checkout needed to get a Pro test user.
- A leftover `dotnet run` process from a prior session can lock the API's build
  output DLLs (`MSB3026`/`MSB3027` copy retries/failures on `dotnet build`).
  Check `Get-Process -Name Tidansu.API` and `Stop-Process -Force` it before
  building if the build fails only on file-copy errors with no compile errors.
