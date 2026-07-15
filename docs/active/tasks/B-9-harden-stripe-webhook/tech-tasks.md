# B-9 · Technical Tasks — Harden the Stripe webhook endpoint

**Path: LIGHT.** Defence-in-depth on the existing `POST /api/billing/webhook`.
No schema, no entity change → **no migration**. No controller signature /
DTO / route change → **no Kiota regen**. No frontend surface. Signature
verification and the Pro-grant command are untouched. Implementable in **one
developer run**.

Locked decisions (do not re-open): body cap **512 KB**, reject *before* the read;
rate limit **60/min endpoint-wide** (one shared budget, NOT per-IP — Stripe is not
a single caller identity and per-IP keying is untrustworthy until
`ForwardedHeaders`/`KnownProxies` is deploy-configured).

---

## 1. 📋 Technical Tasks

### Backend — API

- [x] **add** endpoint-wide webhook rate-limit policy in `src/Tidansu.API/Extensions/WebApplicationBuilderExtensions.cs`
  - Add a policy-name constant next to the existing ones:
    `public const string WebhookRateLimitPolicy = "billing-webhook";`
  - Inside the existing `builder.Services.AddRateLimiter(...)` block, register a
    third policy following the `AuthRateLimitPolicy` shape, **but with a constant
    partition key** so the whole endpoint shares one budget (not per-IP):
    ```csharp
    options.AddPolicy(WebhookRateLimitPolicy, _ =>
        RateLimitPartition.GetFixedWindowLimiter(
            "billing-webhook",            // constant key = one shared endpoint budget
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 60,
                Window = TimeSpan.FromMinutes(1)
            }));
    ```
  - *Why the constant key:* the auth limiters partition on
    `Connection.RemoteIpAddress` (right for a human caller); Stripe delivers from a
    rotating IP range, so an IP-keyed budget is meaningless here. A single shared
    fixed-window budget bounds a flood regardless of source IP.
  - No change needed to `RejectionStatusCode` — it is already globally set to
    `429 TooManyRequests`, which this policy inherits.
  - No change needed in `Program.cs`: `app.UseRateLimiter()` is already wired
    (line 129) after routing, so per-endpoint `[EnableRateLimiting]` resolves. The
    limiter runs during endpoint routing — **before** the action executes, so the
    `HandleStripeWebhookCommand` never runs on a rejected request (no partial/
    duplicate billing side effect). Satisfies FR-3.

- [x] **modify** exception mapping in `src/Tidansu.API/Middlewares/ErrorHandlingMiddleware.cs`
  🔒 required for the body cap to surface as a 4xx (not a masked 500)
  - Add a `catch (Microsoft.AspNetCore.Http.BadHttpRequestException ex)` clause
    **above** the generic `catch (Exception ex)` block. Set the response status to
    the exception's own code and return the standard `ApiOperationResult` error body:
    ```csharp
    catch (Microsoft.AspNetCore.Http.BadHttpRequestException ex)
    {
        // Kestrel throws this when a request body exceeds the per-endpoint
        // RequestSizeLimit (StatusCode 413) or is otherwise malformed. Surface its
        // real 4xx code instead of masking it as a 500 in the generic catch below.
        logger.LogWarning("Bad request rejected: {StatusCode}", ex.StatusCode);
        context.Response.StatusCode = ex.StatusCode; // 413 for body-too-large
        context.Response.ContentType = "application/json";
        var errorResponse = new ApiOperationResult
        {
            IsSuccess = false,
            Errors = new Dictionary<string, string[]>
            {
                { ApiOperationResult.GeneralErrorKey, new[] { "Request rejected." } }
            }
        };
        await context.Response.WriteAsJsonAsync(errorResponse);
    }
    ```
  - *Why this is needed:* MVC does not model-bind the raw body — the action reads it
    manually via `ReadToEndAsync`, so Kestrel's size check fires **inside** the
    action at first read. Without this clause the resulting `BadHttpRequestException`
    lands in the generic `catch (Exception)` → **500**, violating FR-1's "4xx"
    acceptance criterion and hiding the guard. Do **not** log `ex.Message`/body.

- [x] **modify** the `Webhook()` action in `src/Tidansu.API/Controllers/BillingController.cs`
  🔒 blocked by: the two tasks above
  - Add the two guard attributes to the existing `[HttpPost("webhook")]` action
    (keep the controller thin — attributes only, no logic change):
    ```csharp
    [HttpPost("webhook")]
    [RequestSizeLimit(512 * 1024)]                                   // 524288 bytes
    [EnableRateLimiting(WebApplicationBuilderExtensions.WebhookRateLimitPolicy)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status413PayloadTooLarge)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    ```
  - Add `using Microsoft.AspNetCore.RateLimiting;` and `using Tidansu.Extensions;`
    (mirrors `AuthController`).
  - **Why `[RequestSizeLimit]` and not `RequestFormLimits`:** `RequestFormLimits`
    only bounds *form* parsing — this endpoint reads a raw JSON body, so it would do
    nothing. `[RequestSizeLimit(524288)]` sets
    `IHttpMaxRequestBodySizeFeature.MaxRequestBodySize`, which Kestrel enforces on
    the request body stream. Stripe always sends `Content-Length`, so Kestrel
    rejects at the **first** body access (throws before buffering the full payload);
    for a chunked/unknown-length body it aborts mid-stream the moment the cap is
    crossed. Either way `ReadToEndAsync` never returns an oversized buffer — the read
    is short-circuited, satisfying FR-1. The unchanged manual-read code in the action
    body stays as-is.
  - Leave `[AllowAnonymous]` and the `HandleStripeWebhookCommand` dispatch exactly
    as they are (FR-3 non-regression).

### Backend — Domain / Application / Infrastructure

- No changes. (No entity, DbContext, repository, command, or validator touched.)

### Frontend

- No changes. (No contract/Kiota change; nothing user-visible.)

---

## 2. 🔒 Security Considerations

- 🟠 **High — status code must read as transient to Stripe's auto-retry (Open Q4).**
  Stripe treats any non-2xx as a failed delivery and retries with exponential
  backoff (up to ~3 days). Both guard responses are safe under this:
  - Rate-limit rejection → **429** (framework default). Transient: Stripe backs off
    and re-delivers; once the 1-min window clears the retry succeeds. **Recommended
    as-is.** A `Retry-After` header is optional and unnecessary — Stripe uses its own
    backoff schedule for webhooks.
  - Body-cap rejection → **413**. Also retried by Stripe, but a legitimate Stripe
    event is a few KB to low tens of KB — it will *never* reach 512 KB, so 413 only
    ever fires on junk/oversized traffic. Retry semantics there are moot.
  - [x] Confirm during manual verify that a rate-limited request returns 429 and a
    subsequent (post-window) correctly-signed event still grants Pro.

- 🟡 **Medium — guards must not leak or half-process.** Both guards reject *before*
  the command runs, so no partial/duplicate Pro grant is possible (FR-3). The new
  `BadHttpRequestException` handler must **not** log the request body or exception
  message (could echo attacker payload); log only `ex.StatusCode`.
  - [x] Verify the new catch clause logs status code only, no body/message.

- 🟢 **Low — shared-budget DoS nuance.** An endpoint-wide 60/min budget means a
  flood can, in principle, exhaust the shared budget and cause Stripe's real events
  to 429 briefly. Accepted trade-off: Stripe retries, and 60/min is generous vs.
  real cadence. Noted, not mitigated further (per locked decision).

---

## 3. 📈 Scalability / Correctness Considerations

- **Body read is now bounded** — the previously unbounded `ReadToEndAsync` on an
  anonymous endpoint can no longer buffer an arbitrarily large body into memory.
  This is the core scalability win. Global Kestrel `MaxRequestBodySize` (~28.6 MB)
  is unchanged; this is the tight per-endpoint cap.
  - [x] Confirm a >512 KB POST is rejected without the process buffering the whole
    body (observe fast rejection, no handler log).
- **In-memory fixed-window limiter is per-instance.** The shared budget is per API
  process; if the API is ever scaled to multiple instances the effective limit is
  `60 × instanceCount`. Fine for the current single-instance deployment; flag for
  future horizontal scaling (would need a distributed limiter). No action now.

---

## 4. 📦 New Dependencies

No new dependencies required. `Microsoft.AspNetCore.RateLimiting`,
`System.Threading.RateLimiting`, `[RequestSizeLimit]`, and `BadHttpRequestException`
are all in the framework already in use.

---

## 5. ❓ Open Questions

No open questions. The requirements' open questions are resolved by the locked
decisions and by the recommendations above:
1. Body cap **512 KB** — locked.
2. Rate limit **60/min** — locked.
3. **Endpoint-wide** (constant partition key), not per-IP — locked; implemented above.
4. Status codes (**429** rate limit / **413** body cap) both read as transient to
   Stripe's retry logic — recommended and adopted (§2).

> Note for the human: no fan-out skill (`design-an-interface` /
> `improve-codebase-architecture` / `request-refactor-plan`) is warranted — the seam
> is a single endpoint's guard config.

---

## Refactoring (touched files only)

- [refactor] The `BadHttpRequestException` mapping added to `ErrorHandlingMiddleware`
  is a general correctness improvement (any malformed/oversized request across the API
  now surfaces its true 4xx instead of a masked 500), consistent with the file's
  existing exception→status mapping pattern. Scope stays within the file already
  touched by this task. No other refactor needed — `BillingController` stays thin
  (attributes only), and the limiter registration mirrors the existing policy shape.

---

## Verification (no automated suite — manual end-to-end)

- [x] `dotnet build` is green (from repo root or `src/Tidansu.API`).
- [ ] Frontend unaffected — `npm run build` (vue-tsc) from `src/Tidansu.App` still
  green (sanity only; no FE change). *Not run — no frontend file touched by this task.*
- [x] Run the API: `dotnet run` from `src/Tidansu.API` (listens on `http://localhost:5081`).
- [x] **Oversized body → early 413.** Create a >512 KB file
  (`fsutil file createnew big.json 600000` on Windows, or any ~600 KB file) and POST it:
  `curl -i -X POST http://localhost:5081/api/billing/webhook -H "Content-Type: application/json" --data-binary "@big.json"`.
  Observe **413**, and confirm the API log shows **no** signature-verification /
  `HandleStripeWebhook` activity (handler never ran).
- [x] **Burst > limit → 429.** Fire 61 quick POSTs within a minute (PowerShell:
  `1..61 | % { curl -s -o NUL -w "%{http_code}`n" -X POST http://localhost:5081/api/billing/webhook -H "Content-Type: application/json" -d "{}" }`).
  Observe the first ~60 return 400 (bad signature, expected) and the excess return **429**.
- [x] **Normal Stripe event → still 200 + Pro grant.** Drive a real correctly-signed
  event with the Stripe CLI
  (`stripe listen --forward-to localhost:5081/api/billing/webhook`, then
  `stripe trigger checkout.session.completed`). Observe **200** and confirm the
  target account is granted Pro exactly as before — no regression to signature
  verification or the Pro-grant flow (FR-3). *Verified via the `verify`/`run`
  fallback below (local dev has `StripeSettings:Enabled=false`, so `DirectBillingService`
  is the active `IBillingService`, not `StripeBillingService` — Stripe CLI wasn't run).*
- [x] Use the `verify` / `run` skills to drive the flow in the running app if a
  Stripe CLI session isn't available; at minimum cover the three cases above
  (happy path, oversized → 413, burst → 429).
