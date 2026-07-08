# Code Review: B-4 · Real login email for production
**Date**: 2026-07-08
**Reviewer**: branch-code-reviewer agent
**Diff base**: working tree (uncommitted) vs HEAD
**Files changed**: 4 code + 1 new
- `src/Tidansu.Domain/Exceptions/EmailDeliveryException.cs` (new)
- `src/Tidansu.Infrastructure/Services/EmailService.cs`
- `src/Tidansu.Infrastructure/Extensions/ServiceCollectionExtensions.cs`
- `src/Tidansu.API/Middlewares/ErrorHandlingMiddleware.cs`
- `src/Tidansu.API/appsettings.json` (no changes to secrets — verified empty)

## Summary
Closes the three real gaps behind the existing `IEmailService` seam: the prod
send branch now fails loud (throws a sanitized `EmailDeliveryException` on
`!Successful` or a raw provider throw), a startup guard aborts a prod boot with
missing/invalid `SmtpSettings`, and the middleware maps the new exception to a
generic 500. Clean Architecture layering is respected, no secret or magic
link/token can reach logs or exception messages, dev behaviour is untouched, and
no live credential is committed. Solid, security-conscious implementation — no
blocking issues.

## 🔴 Critical (must fix before merge)
None.

## 🟠 Major (strongly recommended)
None.

## 🟡 Minor (nice-to-have)
### [N1] Middleware uses a non-constant string as the log message template
**File**: `src/Tidansu.API/Middlewares/ErrorHandlingMiddleware.cs:105`
**Category**: Correctness (logging)
**Description**: `logger.LogError(ex.Message)` passes the interpolated message
(`"Failed to deliver email to <recipient>."`) as the message *template* rather
than a parameter (CA2254). It also drops the exception object. In practice the
recipient is an email address and contains no `{`/`}`, so Serilog won't
mis-parse it, and `EmailService` has already logged the real failure reason with
proper structured logging — so this is cosmetic. Note it is consistent with the
existing `NotFoundException` catch (`:49`, `logger.LogWarning(ex.Message)`), so
it is an established pattern in this file, not a regression.
**Recommendation**: Optional — `logger.LogError("Email delivery failed for
{Recipient}", recipient)` would restore structured logging, but requires surfacing
the recipient (the exception intentionally carries it only in the message). Fine
to leave as-is given the upstream structured log already exists.

### [N2] Failure log echoes provider-controlled exception text
**File**: `src/Tidansu.Infrastructure/Services/EmailService.cs:49`,
`EmailService.cs:58`
**Category**: Security (defense-in-depth)
**Description**: On a send failure the recipient plus `ex.Message` /
`response.ErrorMessages` are logged. `System.Net.Mail.SmtpException` /
`SmtpFailedRecipientException` messages do not embed the `NetworkCredential`
password, so no secret leaks today. The magic link lives only in the email body,
which is never logged. This is correct — flagged only so a future provider swap
(e.g. an API sender whose error payload echoes request context) is reviewed
against this assumption.
**Recommendation**: No change now. Keep "recipient + provider error text only"
as the invariant if the sender is ever replaced.

## 🧭 Convention Violations (project rules)
None.
- Layering is correct: `EmailDeliveryException` is a plain `Exception` in
  `Tidansu.Domain` with zero outward deps (no FluentEmail types); `EmailService`
  (Infrastructure) throws it; `ErrorHandlingMiddleware` (API) maps it; the
  config-validation guard lives in the Infrastructure composition root
  (`AddInfrastructure`), the right seam for config knowledge.
- Handler discipline intact: `RequestMagicLinkCommandHandler` awaits
  `emailSender.SendAsync` and does not swallow the exception (it propagates to the
  middleware) — matches "handlers throw, middleware builds the HTTP result."
- New `EmailDeliveryException` catch is placed *before* the generic
  `catch (Exception)` (`ErrorHandlingMiddleware.cs:100` vs `:121`), so it wins.

## 🏗️ Architecture Notes
- **Fail-loud on misconfiguration (FR-6):** `RequireSmtpSetting` and the
  `int.TryParse`/`bool.TryParse` guards run synchronously inside `AddInfrastructure`
  (outside the `AddSmtpSender` factory lambda), so an empty/invalid prod
  `SmtpSettings` aborts the process at boot with a message that names the missing
  *key* and never echoes the value — mirroring the existing JWT-secret guard.
- **No silent dev fallback in prod:** `EmailService.SendEmailAsync` branches on
  `IWebHostEnvironment.IsDevelopment()`; the file-writer path is unreachable in
  Production, so a misconfigured prod cannot masquerade as a dev file write.
- **FR-4 (no dev link in prod) verified, not weakened:** `MagicLinkEmailSender`
  still returns `link` only under `IsDevelopment()`, else `null`; the response
  contract is unchanged, so no Kiota regen / frontend change is needed — correct.
- **Secrets (FR-5):** `appsettings.json` ships `SmtpSettings:Host/Username/Password`
  empty; only non-secret `Port`/`EnableSsl`/`SenderEmail`/`SenderName` defaults are
  present. No live credential in source.
- **Note (not a defect):** `SenderEmail`/`SenderName` are *not* covered by the
  startup guard — if an operator omits `SmtpSettings__SenderEmail`, FluentEmail
  falls back to the non-secret `noreply@tidansu.com` default rather than failing
  loud. Acceptable (non-secret, deliverability-only), but worth the operator
  knowing; SETUP.md already lists both as required env vars.
- **Known deferred risk (from tech-tasks, restated for the security reviewer):**
  `POST /api/auth/magic-link` keeps the loose `auth` rate-limit policy
  (10 req/min per IP), which permits some mailbombing of a victim inbox now that
  real email actually sends. Intentionally deferred to Phase 2 (FR-8) — not
  introduced by this change, but the blast radius is now real, so flag it for the
  parallel security review.

## 👍 Positives
- The exception is genuinely sanitized — message carries only the recipient, and
  every log/throw site was audited to keep the email body (which holds the link)
  and the SMTP password out of logs and messages.
- Startup guard turns a would-be silent "non-delivering prod" into an obvious boot
  failure, and parse-validates `Port`/`EnableSsl` instead of letting a raw
  `FormatException` escape.
- Orphaned-token-on-failure reasoning is sound: the token row is persisted before
  the send and self-expires in 15 min; no compensating delete needed (YAGNI).
- Verification was driven end-to-end for everything not needing live credentials
  (fail-loud boot, runtime 500 with no secret/link in logs, dev path unchanged).

## Action Checklist
- [ ] [N1] (optional) restore structured logging in the middleware catch, or
      accept parity with the existing `NotFoundException` catch.
- [ ] [N2] (no change) keep "recipient + provider error text only" as the log
      invariant if the SMTP sender is ever swapped for an API provider.
- [ ] (security reviewer) confirm the deferred rate-limit looseness on
      `POST /api/auth/magic-link` is acceptable for launch now that email sends.
- [ ] (owner) run the real-send verification in SETUP.md §4 with live Brevo
      credentials — the only acceptance criterion not exercisable in implementation.
