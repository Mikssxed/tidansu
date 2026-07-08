---
name: high-risk-files
description: Files that concentrate Tidansu auth/secret/redirect/rate-limit risk — read these in full for any auth-adjacent change
metadata:
  type: project
---

Read these in full for any auth-adjacent, secret-handling, or redirect change (they carry the security plumbing other code depends on):

- `src/Tidansu.API/Extensions/WebApplicationBuilderExtensions.cs` — JWT validation params (ClockSkew=0, full validation), the `auth` rate-limit policy (10/min per remote IP, fixed window), CORS policy (restricted to `AppSettings:FrontendUrl`), JWT-secret prod guard (`IsProduction`, ≥32 chars).
- `src/Tidansu.API/Program.cs` — pipeline order, HSTS/HTTPS redirect, security headers (nosniff / X-Frame-Options:DENY / Referrer-Policy). No `UseForwardedHeaders` (see [[recurring-gaps]]).
- `src/Tidansu.API/Middlewares/ErrorHandlingMiddleware.cs` — domain-exception → HTTP mapping; the only place client error bodies are shaped (must stay generic, no stack/detail leak).
- `src/Tidansu.Infrastructure/Extensions/ServiceCollectionExtensions.cs` — composition root: DbContext, Identity lockout, JWT, FluentEmail/SMTP registration + prod SMTP startup guard, Stripe-vs-direct billing selection.
- `src/Tidansu.Infrastructure/Services/EmailService.cs` + `MagicLinkEmailSender.cs` — credential-delivery path (bearer magic link).
- `src/Tidansu.Application/Auth/Commands/**` — RequestMagicLink / ConsumeMagicLink / RefreshToken handlers (token hashing, single-use, lifetimes).
- `src/Tidansu.App/src/utils/returnUrl.ts` — the sole open-redirect guard (`safeReturnUrl`); any new redirect surface must route through it.
