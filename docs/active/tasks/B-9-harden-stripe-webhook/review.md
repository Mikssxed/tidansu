# Code Review: B-9 · Harden the Stripe webhook endpoint

**Date**: 2026-07-14
**Reviewer**: branch-code-reviewer agent (security-lensed — no separate security-reviewer run for this LIGHT task)
**Diff base**: origin/main (changes are uncommitted working-tree edits; `main` == `origin/main`)
**Files changed (B-9)**: 3 API files

## Summary
The B-9 change itself is correct, tight, and faithful to `tech-tasks.md`: a
constant-key (endpoint-wide) 60/min fixed-window rate-limit policy, a
`[RequestSizeLimit(512 KB)]` body cap, and a correctly-ordered
`BadHttpRequestException` catch that surfaces the real 4xx (413/429) instead of a
masked 500, logging status only. No plan-limit, ownership, secret, or correctness
defect in the three files. The one real issue is **scope isolation**: the working
tree intermixes B-9 with B-8's uncommitted work — including an unrelated JWT
env-gate change *inside* a B-9-touched file — so a B-9 commit would silently bundle
another task's security-behavior change.

## 🔴 Critical (must fix before merge)
None.

## 🟠 Major (strongly recommended)

### [M1] B-9 diff is not isolated — bundles B-8's unrelated changes (incl. a security-behavior edit in a B-9 file)
**File**: `src/Tidansu.API/Extensions/WebApplicationBuilderExtensions.cs:38-40` (plus working-tree files `Program.cs`, `StripeBillingService.cs`, `stores/useSessionStore.ts`, `views/CreateSpaceView.vue`)
**Category**: Scope / process
**Description**: The task scopes B-9 to exactly three API edits. But
`WebApplicationBuilderExtensions.cs` also carries a change unrelated to the webhook:
the JWT-secret startup guard moved from `builder.Environment.IsProduction()` to
`!builder.Environment.IsDevelopment()` (now also requires the secret in Staging / any
mis-named env). That change belongs to **B-8** (`docs/active/tasks/B-8-security-scalability-audit/`
covers `JwtSettings`/`IsDevelopment` and has its own `review.md`), not B-9. Several
other working-tree files (`Program.cs`, `StripeBillingService.cs`, and two frontend
files) are also B-8, not B-9. Failure scenario: committing "B-9" from this working
tree bundles B-8's production-gate change and unreviewed-under-this-task edits into
the webhook-hardening commit, muddying history and letting a security-relevant
startup change ride in under the wrong task.
**Recommendation**: Stage only the three B-9 hunks for the B-9 commit (the two
rate-limit-policy hunks in `WebApplicationBuilderExtensions.cs`, the
`BillingController.cs` attributes, and the `ErrorHandlingMiddleware.cs` catch). Use
`git add -p` to exclude the JWT-guard hunk (lines ~38-40) and commit the B-8 files
separately under B-8. The JWT change itself is directionally fine (a tightening) —
this is purely about attribution/isolation, not correctness.

## 🟡 Minor (nice-to-have)

### [N1] Global catch reduces diagnostics for genuine client-disconnect / malformed requests
**File**: `src/Tidansu.API/Middlewares/ErrorHandlingMiddleware.cs:141-162`
**Category**: Observability
**Description**: The new clause is global middleware, so every
`BadHttpRequestException` across the API now logs `Warning` with **status code only**
and no exception detail. That is exactly right for the webhook (attacker payload must
not be echoed), but it also silences detail for legitimate non-webhook causes
(client disconnect → "Unexpected end of request content" 400, request timeout 408),
which previously logged full detail at `Error` via the generic catch. This is an
acceptable trade for the security win; noting it so a future "why did that 400 fire"
investigation knows the detail was intentionally dropped.
**Recommendation**: Optional — no change required. If richer diagnostics are ever
needed, log `ex.GetType().Name` alongside `ex.StatusCode` (still no message/body).

## 🧭 Convention Violations (project rules)
- None. Controller stays thin (attributes only, dispatch unchanged); the new policy
  mirrors the existing `AuthRateLimitPolicy`/`MagicLinkRateLimitPolicy` shape; the
  new catch matches the file's existing exception→`ApiOperationResult` pattern. No
  frontend touched, so no template-purity/hex/Kiota surface.

## 🏗️ Architecture Notes
- **Catch ordering verified**: the `BadHttpRequestException` clause sits at line 141,
  above the generic `catch (Exception)` at 184. `Microsoft.AspNetCore.Http.BadHttpRequestException`
  derives from `IOException`, and there is no earlier `IOException`/base-type catch to
  shadow it — so it reliably intercepts before the 500 fallthrough. Correct.
- **No 2xx-on-rejection risk**: `ex.StatusCode` defaults to 400 and Kestrel sets
  4xx (413 body cap, 400 malformed, 408 timeout) — the middleware can never emit a 2xx
  on a rejected request, so Stripe's non-2xx→retry contract holds (413/429 both read as
  transient). The rejection also occurs during routing (429) or at first body read
  (413), i.e. **before** `HandleStripeWebhookCommand` dispatches — no partial/duplicate
  Pro grant. Matches FR-3.
- **Size cap short-circuits the read**: `[RequestSizeLimit(524288)]` sets
  `MaxRequestBodySize` on the body stream; with Stripe's `Content-Length` present,
  Kestrel throws on first access, so `ReadToEndAsync` never returns an oversized buffer.
  The unbounded-buffer concern is genuinely closed.
- **Partition key is a true constant**: `"billing-webhook"` literal, not
  `RemoteIpAddress` — one shared endpoint budget, exactly as decided. In-memory
  fixed-window is per-instance (limit becomes 60 × instances under horizontal scaling);
  already flagged in tech-tasks §3, no action now.

## 👍 Positives
- Precisely scoped implementation matching the tech plan; no logic added to the
  controller, no change to signature verification or the Pro-grant command.
- Security discipline in the catch: status-only logging with an explicit comment on
  *why* the body/`ex.Message` must not be logged.
- Rate-limit rejection status inherited from the global `RejectionStatusCode = 429`
  rather than re-specified — DRY and consistent with the other policies.
- `ProducesResponseType` for 413/429 added so the OpenAPI contract reflects the new
  rejection paths.

## Action Checklist
- [ ] [M1] Split the commit: stage only the 3 B-9 hunks; commit the JWT-guard hunk and
      other working-tree files under B-8.
- [ ] [N1] (Optional) Add `ex.GetType().Name` to the warning log if non-webhook 4xx
      diagnostics are later needed — no message/body.
</content>
