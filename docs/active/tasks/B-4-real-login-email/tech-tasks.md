# B-4 · Real login email for production — Technical Tasks

_Author: tech-lead · Date: 2026-07-08 · Status: tech-planning · Scope: requirements Phase 1 only_

## Context & seam summary (read first)

The delivery abstraction is already deep and correctly placed: `IEmailService`
(`Tidansu.Domain/Interfaces`) is the single interface behind which _all_ delivery
strategy lives. `EmailService` (Infrastructure) branches on
`IWebHostEnvironment.IsDevelopment()` — dev writes an HTML file, prod calls
FluentEmail `SendAsync()`. The prod SMTP sender is wired in
`ServiceCollectionExtensions.AddInfrastructure` reading `SmtpSettings:*`, with
credentials expected from env (`SmtpSettings__Username` / `SmtpSettings__Password`).
`FluentEmail.Smtp` 3.0.2 is already referenced, so **no new package** and **no new
seam** are needed — this task closes three real gaps behind the existing interface:

1. **Fail-loud on delivery failure (FR-6):** today the prod branch of `EmailService`
   logs an error but returns normally, so `RequestMagicLinkCommandHandler` still
   returns `200 OK` — it _pretends it delivered_. Must throw instead.
2. **Fail-loud on misconfiguration (FR-6):** no startup guard exists for SMTP
   (contrast the JWT-secret guard in `AddPresentation`). A prod boot with empty
   `SmtpSettings` silently produces a non-delivering sender.
3. **Operator provider config (FR-5):** the chosen provider's SMTP credentials must
   be supplied purely via env; default config carries zero live secrets.

Already-satisfied requirements (verify, do not re-implement):

- **FR-3** dev file-write + no external call — `EmailService` dev branch. Keep intact.
- **FR-4** raw dev-link never in prod — `MagicLinkEmailSender.SendAsync` returns
  `null` when not `IsDevelopment()`; `LoginView.vue` guards `v-if="devLink"`.
  **Contract unchanged → no Kiota regeneration, no frontend code change.**
- **FR-7** single-use / 15-min / supersede — owned by `RequestMagicLinkCommandHandler`
  + `MagicLinkTokensRepository`; this task touches delivery only, not the token.

---

## 1. 📋 Technical Tasks

### Backend — Domain

- [x] create `EmailDeliveryException` in `src/Tidansu.Domain/Exceptions/EmailDeliveryException.cs`
  (plain `Exception` subclass, e.g. `EmailDeliveryException(string recipient) : Exception($"Failed to deliver email to {recipient}.")`).
  *Why:* gives the delivery path a sanitized, domain-owned failure signal the API
  layer maps deliberately — its message carries only the recipient, never the email
  body/link or provider secret. Domain keeps zero outward deps (no FluentEmail types).

### Backend — Application

- [x] No Application change required. `RequestMagicLinkCommandHandler` already persists
  the token before send and awaits `emailSender.SendAsync(...)`; letting the new
  exception propagate is the correct behaviour (handler must not swallow it).
  *(Note in review: token row persisted before a failed send is harmless — it
  expires in 15 min and was never delivered.)*

### Backend — Infrastructure

- [x] modify prod send branch to fail loud in `src/Tidansu.Infrastructure/Services/EmailService.cs`
  — after `await emailBuilder.SendAsync()`, when `!response.Successful` **throw
  `EmailDeliveryException(to)`**; also wrap the `SendAsync()` call in try/catch so a
  raw provider/SMTP exception is logged (recipient + generic reason only) and
  re-thrown as `EmailDeliveryException(to)`.
  *Why:* satisfies FR-6 ("must not pretend it delivered") and FR-2 (failure is
  recorded). Provider-agnostic — works for any SMTP provider chosen.
- [x] harden failure logging so no secret/link leaks in `src/Tidansu.Infrastructure/Services/EmailService.cs`
  — the error log must contain the recipient and provider error text only, and must
  **never** log `htmlBody`, `emailBuilder.Data.Body`, or the token/link (the link
  lives in the body). Keep the existing `LogError` recipient shape; do not add the
  body to any log or exception message.
  *Why:* FR-2/FR-6 — the magic link is a bearer credential; it must never reach logs.
- [x] add prod SMTP misconfiguration startup guard in `src/Tidansu.Infrastructure/Extensions/ServiceCollectionExtensions.cs`
  — in the `else` (non-development) branch, before/while registering the SMTP sender,
  validate that `SmtpSettings:Host`, `SmtpSettings:Username`, `SmtpSettings:Password`
  are non-empty and that `Port`/`EnableSsl` parse; on any missing/invalid value
  **throw `InvalidOperationException`** with a clear operator message naming the
  missing key (e.g. "SmtpSettings:Username is missing. Set the SmtpSettings__Username
  environment variable.") — **never echo the value**.
  *Why:* FR-6 fail-loud at boot, mirroring the existing `JwtSettings:Secret` guard in
  `AddPresentation`. Prevents a prod instance booting with a silently non-delivering
  sender. Composition root is the right seam for config validation (locality of
  config knowledge). Provider-agnostic.

### Backend — API

- [x] add `EmailDeliveryException` mapping in `src/Tidansu.API/Middlewares/ErrorHandlingMiddleware.cs`
  — a `catch (EmailDeliveryException ex)` that returns `500` with the existing generic
  `ApiOperationResult` ("Something went wrong.") body and logs at `Warning`/`Error`
  with the recipient only (no body/link/secret). Place it before the generic
  `catch (Exception)`.
  *Why:* FR-6 (reported as failed, not success) + FR-2 (request completes via handled
  middleware, no unhandled crash). Generic client message avoids leaking provider
  internals; `LoginView.vue`'s catch already shows "We couldn't send your link."
- [x] confirm no live secrets in default config in `src/Tidansu.API/appsettings.json`
  — leave `SmtpSettings:Host/Username/Password` empty; keep `SenderEmail`/`SenderName`
  as non-secret placeholders; optionally add a short comment / doc line listing the
  required prod env vars. No credentials committed.
  *Why:* FR-5 — same build runs anywhere via config only; zero embedded secrets.

### Configuration — Operator (owner completes after provider pick — see Open Questions)

- [ ] **[operator]** configure the chosen provider's SMTP credentials in the prod
  environment (NOT in source): set `SmtpSettings__Host`, `SmtpSettings__Port`,
  `SmtpSettings__Username`, `SmtpSettings__Password`, `SmtpSettings__EnableSsl`, and
  the sending identity `SmtpSettings__SenderEmail` / `SmtpSettings__SenderName`
  (resolves Open Question 2). These land through the existing `SmtpSettings:*` seam —
  no code change once the provider is picked.

### Frontend

- [x] No frontend code change required. `useAuth.requestMagicLink` returns
  `res?.data?.devLink ?? null` and `LoginView.vue` renders the dev-link button under
  `v-if="devLink"`; in prod `devLink` is `null`, so the button never shows. Response
  contract is unchanged → **no Kiota regeneration**.

### Refactoring

- [x] `[refactor]` (optional, touched-file only) `src/Tidansu.Infrastructure/Services/EmailService.cs`
  — evaluated: after the fail-loud change the single `SendEmailAsync` still branches
  cleanly on `IsDevelopment()` (one interface, small, readable). Not awkward → no
  extraction (Phase 1 scope, YAGNI).
  — after the fail-loud change, the single `SendEmailAsync` still branches dev-file vs
  prod-send on `IsDevelopment()`. This is acceptable (small, one interface, clear), but
  if the prod branch grows, consider extracting the two strategies behind
  `IEmailService` implementations selected at composition time. **Do not** do this now
  unless the fail-loud edit makes the method awkward — scope is Phase 1 only. No other
  touched file needs refactoring.

### Security hardening (post-review follow-up · S-H1 / S-M1 · 2026-07-08)

Addresses the security-review findings that became *materially* meaningful once B-4
wired real, quota-metered email. Chosen limits and rationale below.

- [x] tighten the magic-link per-IP rate limit (S-H1) in
  `src/Tidansu.API/Extensions/WebApplicationBuilderExtensions.cs` +
  `src/Tidansu.API/Controllers/AuthController.cs`
  — added a dedicated `MagicLinkRateLimitPolicy` (`"magic-link"`): **3 requests/min
  per IP** (fixed window), applied to `POST /api/auth/magic-link` only. `consume` /
  `refresh` stay on the shared `auth` policy (10/min). *Rationale:* 3/min covers a real
  user's double-click + one retry while sharply capping how fast one IP can drive real
  outbound email; nothing else loosened.
- [x] add a per-recipient throttle (S-H1, the distributed half) —
  `src/Tidansu.Domain/Interfaces/IMagicLinkThrottle.cs` (interface),
  `src/Tidansu.Infrastructure/Services/MagicLinkThrottle.cs` (`IMemoryCache`-backed impl,
  registered in `ServiceCollectionExtensions`), checked in
  `RequestMagicLinkCommandHandler` before any token/DB/send work.
  — keyed on the **normalized recipient email**: **60s cooldown between sends** +
  **max 5 sends/hour** per address (rolling window). On throttle it throws
  `MagicLinkThrottledException` (Domain) → a generic **429** identical whether or not the
  account exists (anti-enumeration preserved; the check never branches on existence).
  Raw token/link never logged. *Rationale:* a per-IP cap alone can't stop a *distributed*
  mailbomb of one victim or a burst that drains the shared Brevo daily quota — both always
  target the same address, so we cap by recipient.
- [x] add `MagicLinkThrottledException` → 429 mapping in
  `src/Tidansu.API/Middlewares/ErrorHandlingMiddleware.cs` (generic body, recipient-only
  `Warning` log; placed before the generic `catch`).
- [x] enable forwarded headers (S-M1) in `src/Tidansu.API/Program.cs`
  — `UseForwardedHeaders` (X-Forwarded-For / X-Forwarded-Proto) as the first middleware so
  the limiter partitions on the real client IP behind a proxy. `KnownProxies`/`KnownNetworks`
  left at the framework default (loopback only) — an arbitrary client **cannot** spoof
  X-Forwarded-For to dodge the limiter. **Residual B-7:** the real prod proxy's
  address(es)/network(s) must be added to `KnownProxies`/`KnownNetworks` at deploy time
  (documented in `SETUP.md` §5), else the forwarded IP is ignored and all users share one bucket.
- [x] CA2254 nit (`ErrorHandlingMiddleware.cs`) — **skipped by design.** Fixing only the
  `EmailDeliveryException` log to a `{Message}` structured template would diverge from the
  file's existing `catch (NotFoundException)` style (`logger.LogWarning(ex.Message)`); the
  new throttle catch follows the same existing shape for consistency. No build warning is
  emitted today.

**Verification (driven end-to-end, Development, 2026-07-08):**
- (a) dev file-write path unchanged: successful requests returned `devLink` and wrote
  `DevelopmentEmails/Email_*.html`.
- (b) per-IP: 5 requests from one IP (unique emails) → `200,200,200,429,429`
  (empty-body limiter rejection) — confirms 3/min.
- (c) per-recipient: same email from **4 distinct IPs** → `200` then `429,429,429` with the
  JSON throttle body `{"errors":{"general":["Too many requests. Please try again later."]}}`
  — throttle fires even when the per-IP limiter would allow it; the throttled attempts wrote
  **no** dev file (no send/mutation) and logged `Magic-link request throttled for <email>`.
- (d) a fresh single request for a different email from a new IP → `200` with `devLink`.
- Log scan: **0** occurrences of the token/link/SMTP password across the run.
- Forwarded headers confirmed working (the limiter partitioned by `X-Forwarded-For`).

---

## 2. 🔒 Security Considerations

- **Provider secrets in source or logs.** 🔴 Critical.
  - [ ] Verify default `appsettings.json` ships empty `SmtpSettings:Username/Password/Host`
    and that no credential appears in any committed file; secrets arrive only via
    `SmtpSettings__*` env vars (FR-5).
  - [ ] Verify the startup guard and the failure log messages name the missing/failed
    **key** and **recipient** only — never the secret value or the SMTP password.
- **Magic link (bearer credential) leaking to logs.** 🔴 Critical.
  - [ ] Verify no code path logs `htmlBody` / `emailBuilder.Data.Body` / the raw token
    or link. The new `EmailDeliveryException` message must carry the recipient only.
- **Dev-only raw link reaching production (account takeover).** 🔴 Critical.
  - [ ] Verify a prod-like response body for `POST /api/auth/magic-link` contains
    `devLink: null` and no token (FR-4). Defense-in-depth already holds via the
    `IsDevelopment()` guard in `MagicLinkEmailSender`; confirm it is not weakened.
- **Rate-limiting on the link-request endpoint.** 🟠 High (present, but loose).
  - [ ] Confirm `POST /api/auth/magic-link` keeps `[EnableRateLimiting("auth")]`
    (`WebApplicationBuilderExtensions.AuthRateLimitPolicy`, 10 req/min per remote IP,
    fixed window). **Flag:** 10/min is generous for an endpoint that triggers real
    outbound email and enables mailbombing a victim's inbox; it is also IP-based (shared
    NAT / proxies weaken it, missing `X-Forwarded-For` handling). Tightening it and
    adding a per-recipient throttle is Phase 2 (FR-8) — do not implement here, but record
    the risk so the security review at merge is aware it is intentionally deferred.
- **Misconfiguration masquerading as success.** 🟠 High.
  - [ ] Verify a prod boot with missing SMTP config fails loud (startup guard) and a
    runtime send failure returns 500 — never a silent 200 and never a dev-file write in
    prod (FR-6).

## 3. 📈 Scalability / Correctness Considerations

- **Synchronous send blocks the request thread.** The magic-link request awaits the SMTP
  round-trip inline. Acceptable at launch (low sign-in volume, FR-2 "best-effort").
  - [ ] No change now. Note for Phase 3 (FR-10): move to a queued/retried background send
    if provider latency degrades request times; retries must respect the 15-min lifetime.
- **Orphaned token rows on send failure.** The token is persisted before the send throws,
  leaving an unusable row that expires in 15 min.
  - [ ] No change — harmless and self-expiring. Do not add compensating deletion (YAGNI).
- **Provider config parsed at DI registration.** `int.Parse(Port)` / `bool.Parse(EnableSsl)`
  run when the sender factory resolves.
  - [ ] Covered by the startup guard task (parse-validate with a clear message rather than
    a raw `FormatException`).

## 4. 📦 New Dependencies

No new dependencies required. `FluentEmail.Core`, `FluentEmail.Razor`, and
`FluentEmail.Smtp` (3.0.2) are already referenced in
`src/Tidansu.Infrastructure/Tidansu.Infrastructure.csproj`; every SMTP-capable
provider option below drops into the existing sender with configuration only. (A
pure-API provider would instead require a small `ISender` adapter package + code —
avoided by choosing SMTP.)

## 5. ❓ Open Questions

1. **Which transactional email provider? (owner decision at the human gate — do not
   pick here.)** All three below are EU-hosted, GDPR-friendly, and expose SMTP, so each
   needs **zero new code** — only the operator config task. Recommend SMTP over any
   API-only provider precisely because the existing seam then needs no adapter.
   - **Brevo (ex-Sendinblue)** — French company, EU (Paris) data hosting, GDPR-native,
     SMTP relay, free tier ~300 emails/day. *Trade-off:* daily cap and provider branding
     on the free tier; strong, well-known deliverability. **Least code + easiest EU start.**
   - **Mailjet** — EU (France) infrastructure with a GDPR posture, SMTP relay, free tier
     ~6,000/month (200/day). *Trade-off:* good deliverability; now under Sinch (US parent),
     so confirm the EU data-residency terms if that matters for B-5's legal picture.
   - **Scaleway Transactional Email (TEM)** — French cloud, strict full-EU data residency,
     SMTP support, very cheap pay-as-you-go. *Trade-off:* strongest EU residency but newer
     and less battle-tested deliverability reputation, and it pushes you toward domain
     authentication (SPF/DKIM) sooner — which is Phase 2 (FR-9) anyway.
   - *(Deliverability benchmark, not recommended: Postmark has excellent inbox rates but is
     US-hosted → cross-border-transfer question for a Poland/EU launch.)*
2. **Sending identity (FR-5 / requirements OQ-2):** confirm the prod from-address and
   display name (e.g. `noreply@tidansu.com` / "Tidansu") and that the domain is available
   to authenticate later. Feeds the `SmtpSettings__SenderEmail/__SenderName` operator task.
3. **Phase-1 user-facing failure copy (requirements OQ-3):** assumed acceptable that a
   delivery failure is operator-visible (log + 500 → `LoginView` shows "We couldn't send
   your link. Please try again."), deferring richer in-app resend/failure UX to Phase 2
   (FR-8). Confirm at the gate.

---

## ✅ Verification Tasks (no automated test suite — drive it)

- [x] `dotnet build` is green (whole solution) — 0 errors; the 12 warnings are all
      pre-existing NU1903 package-vulnerability advisories, none from touched files.
- [x] `npm run build` (vue-tsc) is green from `src/Tidansu.App` — regression check passed
      (no frontend/API contract changed).
- [ ] **[owner] Prod-like happy path (sends a REAL email):** needs the owner's live Brevo
      credentials — could not be exercised in implementation. Covered step-by-step in
      `SETUP.md` §4 (FR-1, FR-4, FR-7).
- [x] **Prod-like fail-loud on misconfiguration:** started Production with empty
      `SmtpSettings__Host/Username/Password` → app aborted at boot with
      `InvalidOperationException: SmtpSettings:Host is missing. Set the SmtpSettings__Host
      environment variable.` — key named, no secret, and no `DevelopmentEmails/*.html`
      written in prod (FR-6).
- [x] **Prod-like runtime send failure:** pointed config at an unreachable SMTP host
      (`127.0.0.1:2525`) with a dummy secret; POST returned a handled **500**
      (`{"errors":{"general":["Something went wrong."]},"isSuccess":false}`), the log
      recorded the recipient + `Failure sending mail.` with **0** occurrences of the
      secret and **0** of the token/link, and the process stayed up across repeated
      requests (FR-2, FR-6).
- [x] **Dev unchanged:** ran Development; POST wrote
      `DevelopmentEmails/Email_dev-tester_example_com_*.html`, the log used the
      "Development mode: Email saved to …" branch (**no outbound SMTP**), and the response
      returned `devLink` for the dev convenience (FR-3).

## Traceability

FR-1 → prod-send fail-loud tasks + happy-path verify · FR-2 → EmailService throw +
middleware map + failure-log hardening · FR-3 → dev branch kept + dev verify ·
FR-4 → existing `MagicLinkEmailSender` guard + frontend `v-if` (verify only) ·
FR-5 → appsettings-no-secrets + operator config task · FR-6 → startup guard + throw +
middleware map · FR-7 → untouched token logic (verify only). FR-8–FR-11 are Phase 2/3,
explicitly out of scope.
</content>
</invoke>
