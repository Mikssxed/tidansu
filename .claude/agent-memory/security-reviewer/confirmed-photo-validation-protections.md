---
name: confirmed-photo-validation-protections
description: Verified B-13 photo-validation controls (PhotoPolicy/SpacePhotoGuard) and the accepted polyglot residual — don't re-flag these
metadata:
  type: project
---

Verified 2026-07-15 reviewing B-13 (closes B-8 finding 🟠 S-2). Confirmed controls —
**don't re-flag**; re-check only if the cited code changes.

- **Sniff-vs-label agreement, not just an allow-list.** `PhotoPolicy.Check` requires the
  sniffed magic bytes to *equal* the declared data-URL media type. Script-mislabelled-as-PNG
  and real-JPEG-declared-as-PNG both reject. SVG is excluded (the one format that executes
  inside `<img>`); `image/jpg` rejected (not a real MIME type).
- **Accepted residual — header-only sniff accepts polyglots.** Only the first 12 bytes are
  inspected, so `PNG signature + <script>…` passes and is stored. **This is intentional and
  correct for the threat:** `<img>` never executes, and browsers don't content-sniff `data:`
  URLs (declared MIME governs; top-level `data:` navigation is blocked). Don't re-raise it as
  a finding against the current code. **Trigger to re-open:** B-16 moves photos off-row — if a
  photo-serving endpoint sets `Content-Type` from the *stored* declared type, the polyglot tail
  becomes the response body. Mitigated by global `nosniff` (`Program.cs`) only if the new
  endpoint flows through that middleware. **How to apply:** on B-16, check nosniff +
  `Content-Disposition` + re-encode-on-ingest before treating stored photos as safe to serve.
- **S-2 is closed for WRITES ONLY (FR-7, accepted).** Stored rows are never re-validated on
  read. Currently unexploitable: the SPA renders `item.photo` **nowhere** (no `<img :src>`;
  `ItemDetailModal` emits `addPhoto`, nothing consumes it). **How to apply:** when a render or
  capture flow lands, re-check whether the deferred one-off audit of existing rows is still
  safe to defer.

- **Log/response leakage (S-5) is closed, but the safety is INHERITED, not local.**
  `ErrorHandlingMiddleware` logs `ex.Message` for every `ValidationException` — safe *only*
  because `ValidationException` hardcodes its message, `ValidationBehavior` projects
  `f.ErrorMessage` (never `f.AttemptedValue`), and `SpacePhotoGuard` uses fixed consts with an
  index-only error key (`Space.Items[{i}].Photo`). **How to apply:** a `ValidationException`
  message overload, or any validator using `{PropertyValue}`, silently turns that log line into
  a sink for a ~7 MB attacker string. Check both on any validation change.

- **Guard placement invariant (fragile, convention-only).** In both space handlers the order is
  `PlanPolicy` gate → `SpacePhotoGuard.ThrowIfInvalid` → persist. Photo checks live in the
  *handler*, not FluentValidation, precisely because FV runs in the MediatR pipeline *before*
  handlers and would return 400, preempting the Free user's 403 `{plan:["photos"]}` (FR-4).
  The guard also sits **outside** B-12's `sp_getapplock`. **How to apply:** nothing enforces
  this ordering — on any edit to these handlers, re-confirm the plan gate is still first and
  the guard is still outside the lock. Negative test: Free user + malformed photo must yield
  **403, not 400**.

- **Fail-closed, unlike B-12's app-lock.** `Check` returns `None` only for `photo is null` or a
  full pass; no accepting default. Cheap rejects strictly precede expensive ones (length →
  prefix → 64-char-bounded comma search → arithmetic decoded size → O(n) charset scan →
  12-byte decode). No regex (ReDoS), never materialises a multi-MB `byte[]`.
