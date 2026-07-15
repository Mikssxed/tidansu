---
name: arch-errorhandling-middleware-masks-4xx
description: ErrorHandlingMiddleware's generic catch(Exception) turns Kestrel BadHttpRequestException (413/400) into a 500 — needs an explicit clause to surface real 4xx
metadata:
  type: project
---

`src/Tidansu.API/Middlewares/ErrorHandlingMiddleware.cs` maps a fixed set of domain
exceptions to status codes, with a final `catch (Exception) → 500`. Kestrel throws
`Microsoft.AspNetCore.Http.BadHttpRequestException` (which carries a real `StatusCode`,
e.g. **413** for `[RequestSizeLimit]` exceeded, 400 for malformed body) — and because
raw-body endpoints read the body *inside* the action (`ReadToEndAsync`), that throw
propagates into the generic catch and surfaces as **500**, masking the intended 4xx.

**Why:** discovered planning B-9 (webhook body-size cap). `[RequestSizeLimit]` alone is
not enough to get a 4xx on this stack; the middleware must have an explicit
`catch (BadHttpRequestException ex) { context.Response.StatusCode = ex.StatusCode; ... }`
clause above the generic catch.

**How to apply:** whenever a task adds `[RequestSizeLimit]` / body-size or
malformed-request rejection and expects a specific 4xx, pair it with a
`BadHttpRequestException` mapping task in ErrorHandlingMiddleware, and never log
`ex.Message`/body (may echo attacker payload). Related: [[billing-stripe-webhook-trust-seam]].
</content>
</invoke>
