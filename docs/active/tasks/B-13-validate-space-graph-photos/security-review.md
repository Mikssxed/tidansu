# Tidansu — Security Review (B-13)
**Date:** 2026-07-15
**Scope:** B-13 only (`validate-space-graph-photos`) — `PhotoPolicy`, `SpacePhotoGuard`,
the Create/Update space handlers' guard call sites, the new DTO validators, and
`SpacesController`'s `[RequestSizeLimit]`/413. Working tree also carries uncommitted
B-7/B-10/B-11/B-12 work — **not reviewed here**.
**Remit:** trust boundaries · payload/secret leakage · fail-open behaviour.
(Correctness/convention/base64 arithmetic → `review.md`, parallel reviewer.)
**Type:** Findings report only — no code changes made.

**Overall:** **B-13 genuinely closes S-2's write path.** I attacked the sniff, traced every
photo route to the DB, and audited every message/log site — I found **nothing Critical or
Major**, and I'm not going to manufacture one. The declared-type-must-agree-with-sniffed-bytes
design defeats the actual S-2 payload (script mislabelled as PNG), SVG is correctly excluded,
and the S-5 leak risk is properly closed: no photo byte reaches a response, an exception
message, or a log line. The header-only sniff *does* accept polyglots (valid PNG header +
arbitrary tail) — but that is **inert against the stated threat** (an `<img>` source), so it's
a documented residual, not a hole. Four Minors below are about the *edges*: the residual's
future trigger (B-16), the accepted read-path gap, an unauthenticated-by-size DoS, and a
pre-existing plan-gate nuance.

## What's already done right

Verified, not assumed — don't re-flag these:

- **The sniff-vs-label agreement is real and is the right control.** `PhotoPolicy.cs:121`
  requires `sniffedMediaType == normalizedMediaType`. `data:image/png;base64,<script>alert(1)</script>`
  → `NotAnImage` (`PhotoPolicyTests.cs:52`). A real JPEG *declared* as PNG is also rejected
  (`:53`) — the check is agreement, not merely "is some image". That is strictly stronger
  than the allow-list S-2 asked for.
- **SVG is excluded** (`PhotoPolicyTests.cs:48` → `DisallowedType`). This is the one format
  that *does* execute script inside `<img>`. Excluding it is the single most load-bearing
  decision in the allow-list, and it's correct.
- **`javascript:` and `data:text/html` are rejected** (`:51`, `:49`) — the literal payloads
  named in the B-8 S-2 finding.
- **S-5 (payload leakage) is closed. I verified the code, not the developer's grep claim:**
  - `SpacePhotoGuard.cs:16-20` — five fixed `const` messages, zero interpolation of `photo`.
  - `SpacePhotoGuard.cs:36` — the error key is `$"Space.Items[{i}].Photo"`; `i` is a loop
    index, not attacker data. Attribution without disclosure. Correct.
  - `ValidationException.cs:4` — `Message` is the fixed literal `"One or more validation
    errors occurred."`. This is what makes `ErrorHandlingMiddleware.cs:32`
    (`LogWarning(ex, "Validation error: {Message}", ex.Message)`) safe — it logs a constant.
    Note this safety is *inherited*, not local (see S-L1).
  - `ValidationBehavior.cs:30` projects `f.ErrorMessage` only — **never `f.AttemptedValue`**.
    This is the seam where FluentValidation would otherwise echo input.
  - Grepped the whole of `src/` for `{PropertyValue}` / `AttemptedValue`: **zero hits.** The
    new validators use `{PropertyName}` only (`ItemDtoValidator.cs:26`, `RectDtoValidator.cs:12-18`).
    FluentValidation's default `MaximumLength` message emits `{TotalLength}` (a count), not
    the value.
  - `ErrorHandlingMiddleware.cs:146-147` — the 413 path logs `ex.StatusCode` only, with an
    explicit "never log the body" comment. Correct.
- **Plan gate fires before the photo guard — confirmed in both handlers, and the guard cannot
  be reached first.** `CreateSpaceCommandHandler.cs:31-38` (`PlanPolicy.CheckNewSpace` throws
  → guard at `:38`) and `UpdateSpaceCommandHandler.cs:30-37`. FR-4 holds: a Free user sending
  a photo, valid *or* invalid, gets 403 `{plan:["photos"]}`. The handler-side placement (vs.
  FluentValidation, which runs in the MediatR pipeline *before* handlers) is what makes this
  possible — the D-8 ruling was right.
- **A Free user's unchecked photo is never persisted.** The plan gate throws *before*
  `dto.ToEntity` (Create `:42`) and before any mutation of the tracked `existing` (Update
  `:39`). Nothing is written on the 403 path. Throwing before dirtying EF-tracked state
  (Update) also avoids a stray `SaveChanges` elsewhere flushing partial mutations.
- **No second photo write path.** `SpacesController.cs` exposes only GET/GET{id}/POST/PUT{id}/
  DELETE{id}; there is no per-item mutate endpoint. (The `api/spaces/item/` file in the Kiota
  diff is the generated `{id}` indexer, not a new endpoint.) Photos reach the DB through
  exactly the two guarded handlers.
- **No fail-open in `Check`.** `PhotoRejection.None` is returned from exactly two places:
  `:63` (`photo is null`) and `:126` (every check passed). There is no `default:` that
  degrades to accept — `MessageFor`'s `_ => MalformedMessage` (`SpacePhotoGuard.cs:49`) is a
  *reject* default and is unreachable anyway (`:33` filters `None` first). This is the
  opposite of B-12's discarded `sp_getapplock` return code: the guard fails **closed**.
- **No exception can escape `Check` as a non-reject.** I specifically attacked
  `header[DataUrlPrefix.Length..^Base64Suffix.Length]` (`:89`), the one range expression that
  could throw. It's safe: `header` must both `StartsWith("data:")` (≥5) and `EndsWith(";base64")`
  (≥7); for the ranges to overlap the header would need length <12, which requires `;` at
  index 2/3/4 — but those positions are pinned to `t`/`a`/`:` by the `data:` prefix. Header
  length 12 (`"data:;base64"`) yields an empty span → `DisallowedType`. Provably cannot throw.
- **No ReDoS, no full decode, and the cheap-reject order is real.** `Check` is span-based with
  no regex (`:58-127`). Order verified: `null` (`:63`, single ref compare — the hot path)
  → blank (`:66`) → **string length** (`:69`, before any parse) → `data:` prefix (`:72`) →
  comma search **bounded to 64 chars** (`:77`, so a malformed 7 MB blob isn't scanned) →
  base64 suffix (`:85`) → media type (`:90`) → **arithmetic** decoded size (`:101-102`, no
  decoding) → O(n) charset scan (`:106`) → **12-byte** decode (`:112-114`). A multi-MB payload
  is rejected on `photo.Length` alone. A multi-MB `byte[]` is never materialised.
- **The guard is outside B-12's `sp_getapplock`.** `CreateSpaceCommandHandler.cs:38` runs the
  guard; `AddWithinSpaceCapAsync` (which takes the lock) is at `:48`. Photo scanning never
  happens while holding a per-user DB lock — no added lock-contention/DoS surface. D-8.1
  honoured.
- **413 fires before the body is buffered.** `RequestSizeLimitAttribute`
  (`SpacesController.cs:45`, `:58`) is a resource filter that sets
  `IHttpMaxRequestBodySizeFeature.MaxRequestBodySize` *before* model binding reads the body.
  Kestrel rejects on `Content-Length` up front when present, and enforces incrementally when
  chunked — it never buffers past the limit. The resulting `BadHttpRequestException` reaches
  `ErrorHandlingMiddleware.cs:141` (it derives from `IOException`; no earlier catch
  intercepts it) and surfaces `ex.StatusCode` = 413. At 24 MB it is also *below* Kestrel's
  ~28.6 MB default, so it is the binding constraint. This path is correct.

## Security findings

### Critical
None. Nothing in the B-13 diff yields another user's data, a plan bypass with monetary
value, an auth bypass, or secret disclosure.

### High / Major
None.

### Medium / Minor

**S-M1 — Header-only sniff accepts polyglots; inert today, but B-16 is the trigger**
`src/Tidansu.Domain/Constants/PhotoPolicy.cs:194-204`. Only the first 12 bytes are inspected.
A payload of `PNG signature (8 bytes) + <script>alert(1)</script>` declared as
`data:image/png;base64,…` **passes and is stored**: `SniffMediaType` matches `bytes[..8]`
against `PngSignature` (`:197`), returns `image/png`, which agrees with the label → `None`.
Same for a `FF D8 FF` prefix (JPEG, 3 bytes) or `RIFF….WEBP` (WebP).

**Against the stated S-2 threat this does not bite, and I want to be precise about why
rather than leave it as an implied risk:** `<img>` never executes script regardless of
payload content, and browsers do **not** content-sniff `data:` URLs — the declared MIME
governs, and top-level navigation to `data:` URLs has been blocked in all modern browsers
since ~2017. A polyglot rendered as an `<img>` source is a broken-image icon, not an XSS.
The code's own comment (`:186-193`) reasons this correctly, and full decoding would require
an imaging library that is itself a DoS amplifier. **The trade-off is right.** So: header-only
sniffing **is** sufficient for the threat B-13 was scoped to close.

The residual is entirely *prospective*, and it has a named trigger: **B-16 proposes moving
photos off-row**. If B-16 serves a photo from an endpoint that sets `Content-Type` from the
*stored declared type*, the polyglot's tail becomes the response body under an attacker-chosen
image content type. `X-Content-Type-Options: nosniff` is set globally (`Program.cs:115`),
which is what defuses this — so the risk is real but already mitigated *provided the new
endpoint flows through that middleware*.
**Fix:** no change to B-13. Record the constraint on B-16: photo-serving must (a) stay behind
the `nosniff` middleware, (b) send `Content-Disposition: attachment` or serve from a separate
origin/sandbox, and (c) ideally re-encode on ingest, which drops the polyglot tail entirely.
Add the polyglot case (PNG header + script tail → currently `None`) as an **explicit test
documenting the accepted behaviour**, so a future reader doesn't mistake it for a bug or
"fix" it into a full decode.

**S-M2 — S-2 is closed for writes only; stored rows are still trusted on read**
`docs/…/B-13…/task.md` FR-7. The guard is write-time only; existing rows are never
re-validated or blocked on read. Any pre-B-13 row could hold a `javascript:` or
`data:text/html` value that the write path now rejects. **Currently unexploitable and I
confirmed it, rather than assuming:** I grepped the SPA — `item.photo` is **never rendered
anywhere**. `ItemDetailModal.vue:170-172` only emits `addPhoto`/`photoLocked`, and nothing
consumes `addPhoto`; there is no `<img :src>` bound to a photo in the codebase. There is no
capture flow, so there is realistically no hostile stored data. This is a documented,
accepted decision — I'm recording the **trigger condition**, not disputing the ruling.
**Fix:** none now. When a render path is built (B-16/capture flow), either bind photos only
to `<img src>` (never `<a href>`, `iframe`, `window.open`, or CSS `url()`), or run the
one-off audit of existing rows that Open Question 5 currently defers.

**S-M3 — No rate limit on `POST`/`PUT /api/spaces`; the 24 MB body is deserialized before the plan gate**
`src/Tidansu.API/Controllers/SpacesController.cs:40-45`, `:57-58`. The rate limiter is
opt-in per policy (`Program.cs:129` + `EnableRateLimiting` on `AuthController`/
`BillingController` only) — the spaces endpoints have **no policy**. Any authenticated user,
**including a Free user who will be 403'd**, can POST a 24 MB body repeatedly: the body is
fully read and System.Text.Json materialises the photo strings (multi-MB → Large Object Heap)
*before* the handler's plan gate or the guard ever runs. Concurrent requests multiply LOH
pressure. The photo scan itself is **not** an amplifier — it's O(total body), so CPU is
linear in bytes uploaded — meaning "many items each just under the cap" costs the attacker
exactly what it costs the server. `[RequestSizeLimit]` is therefore the *only* backstop, and
it's a per-request one, not a per-user-per-time one.
To be fair to B-13: this is **not a regression** — the ceiling *dropped* from Kestrel's
~28.6 MB default to 24 MB, so B-13 strictly improved it. The gap is pre-existing.
**Fix:** add a fixed-window `EnableRateLimiting` policy partitioned on the authenticated user
id to the spaces mutate endpoints, sized for the debounced autosave cadence. Judge
`[RequestSizeLimit]` as necessary but not sufficient.

**S-M4 — Downgrade rule lets a Free user keep and refill photo slots forever (pre-existing)**
`src/Tidansu.Domain/Constants/PlanPolicy.cs:35`. `CheckSpaceMutation` blocks photos only when
`after.Photos > before.Photos`. A user who subscribes to Pro for one month, attaches N
photos, then downgrades keeps N photo *slots* permanently — and can **replace each photo's
bytes with brand-new arbitrary images indefinitely**, since the count never rises. That is
use of a Pro capability on a Free plan, i.e. a plan bypass with monetary value.
**This is not a B-13 regression** — B-13 didn't touch `PlanPolicy`, and it is arguably the
intended reading of "downgrade keeps data but makes over-cap content read-only". But it's
worth surfacing while photos are under scrutiny, because "read-only" and "you may swap in
unlimited new photos" are very different products. **No unchecked photo is persisted on this
path** — the gate passes, then `SpacePhotoGuard` validates the content normally.
**Fix:** product decision, not a B-13 change. If over-cap photos are meant to be read-only,
`CheckSpaceMutation` must compare photo *content/identity*, not just the count.

### Low / Hardening

**S-L1 — `SpacePhotoGuard`'s log-safety depends on an invariant in another file**
`src/Tidansu.API/Middlewares/ErrorHandlingMiddleware.cs:32` logs `ex.Message` for *every*
`ValidationException`. This is safe **only** because `ValidationException.cs:4` hardcodes its
message and neither `ValidationBehavior` nor `SpacePhotoGuard` puts data there. Nothing
enforces that: anyone adding a `ValidationException(errors, $"…{value}…")` overload, or a
validator using `{PropertyValue}`, silently turns this line into a log-injection sink for a
~7 MB attacker-controlled string. The S-5 mitigation is correct but *load-bearing on a
convention*.
**Fix:** defense-in-depth — log `ex.Errors.Keys` (attribution) rather than `ex.Message`, and
drop the `ex` first argument so no future message/inner-exception can ride along.

**S-L2 — `header[5..^7]` range safety rests on a non-obvious proof**
`PhotoPolicy.cs:89`. Provably cannot throw today (see "done right"), but the proof depends on
the exact literals `"data:"` and `";base64"`. Changing either constant could open an
`ArgumentOutOfRangeException` → generic 500 rather than a clean reject.
**Fix:** add an explicit `if (header.Length < DataUrlPrefix.Length + Base64Suffix.Length)
return PhotoRejection.Malformed;` before the slice. One line, removes the proof obligation.

**S-L3 — No minimum payload size**
`PhotoPolicy.cs:96`. `data:image/jpeg;base64,/9j/` (a 3-byte payload that is just the JPEG
SOI marker) is accepted as a valid photo. Entirely inert — it's 3 bytes and renders as a
broken image. Noted only for completeness; not worth a code change.

## Verification checklist

No Critical/High findings to re-test. These confirm the accepted-residual boundaries and the
Minors:

- [ ] **S-M1 (document, don't fix):** add a test asserting
      `data:image/png;base64,<base64 of PNG-signature + "<script>alert(1)</script>">`
      returns `PhotoRejection.None`, commented as the *accepted* polyglot residual, so the
      trade-off is explicit in the test surface rather than only in a code comment.
- [ ] **S-M1 (B-16 gate):** confirm any future photo-serving endpoint returns
      `X-Content-Type-Options: nosniff` (curl the response headers — don't assume the
      middleware covers it).
- [ ] **S-M3:** fire 10 concurrent 24 MB `POST /api/spaces` as a **Free** user; confirm each
      returns 403 and observe process working set / LOH. Confirms the body is paid for before
      the plan gate, and sizes the rate-limit policy.
- [ ] **S-M3 / 413:** `POST /api/spaces` with a 25 MB body → expect **413** with
      `{"isSuccess":false,"errors":{"general":["Request rejected."]}}`, and confirm the log
      line contains only `Bad request rejected: 413` — no body fragment.
- [ ] **S-M4:** as a Pro user attach 1 photo → downgrade to Free → `PUT` the space replacing
      that photo's bytes with a *different* valid JPEG. Confirm it succeeds (documents the
      current downgrade semantics) and decide whether that is intended.
- [ ] **S-5 regression (do this before merge):** `PUT` a space containing
      `data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==` as an item photo, as a
      **Pro** user. Expect 400 with key `space.Items[0].Photo` and message
      `"Photo must be a JPEG, PNG or WebP image."`. Then grep the Serilog output for
      `PHNjcmlwdD` and for `alert(1)` — **expect zero hits in both the response body and the
      log**.
- [ ] **Plan-gate ordering:** as a **Free** user, `POST` a space with a *deliberately
      malformed* photo (`data:image/png;base64,!!!!`). Expect **403 `{plan:["photos"]}`** —
      **not** 400. A 400 here means the guard has been reordered ahead of the plan gate and
      FR-4 has regressed.
