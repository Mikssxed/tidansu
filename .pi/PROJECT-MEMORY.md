# Project Memory — Tidansu

Durable, repo-specific knowledge accumulated across sessions. Consolidated from
all agent memory files.

---

## Plan Limits (core gate)

- **Free:** 2 spaces, 6 zones/space, 50 items/space, no photos, no sync.
- **Pro:** unlimited spaces/zones/items + photos + sync.
- On cap, paywall opens with `reason` ∈ `{spaces, zones, items, photos, sync}`.
- Downgrade keeps data but makes over-cap content read-only.
- Auth is NOT plan-gated.

## Auth Model

- Passwordless magic-link (NOT plan-gated).
- Single-use, **15-min expiry**, new request supersedes prior links.
- Tokens hashed at rest (never plaintext).
- Dev: email written to `DevelopmentEmails/*.html`; raw link returned only in dev.
- Prod: FluentEmail SMTP (Brevo). Delivery failure → `EmailDeliveryException` → 500.
- Startup guard aborts boot if SMTP creds missing/invalid (non-dev envs).

## Billing / Stripe

- Free→Pro recurring sub via Stripe.
- Webhook is sole Pro authority: `EventUtility.ConstructEvent` first → 400 on failure.
- Account mapping solely via server-set `ClientReferenceId = user.Id` (not email).
- Idempotency: unique-PK insert in `ProcessedStripeEventStore`, catch `DbUpdateException`.
- **Known gap:** `WebhookSecret` was NOT in `IsConfigured` guard (only `SecretKey`+`ProPriceId`).
  Empty `WebhookSecret` → forgeable webhook → free Pro. Re-check on billing changes.
- **Build vs. go-live separate milestones.** B-6 = test-mode verified; real charging
  gated on legal checklist.

## EU / Poland Launch

- Owner in Poland; target market: worldwide.
- Business form: sole trader / JDG baseline.
- Invoicing: Stripe (Stripe Tax + Invoicing) — assumption to validate.
- KSeF e-invoicing always a separate dependency.
- Prefer EU-hosted / GDPR-friendly providers for third-party services processing personal data.

## Auth Rate Limit (known gap)

- `auth` policy = 10 req/min per `RemoteIpAddress` (fixed window).
- No per-recipient throttle. `POST /api/auth/magic-link` is a mailbomb vector.
- Deferred to Phase 2 (FR-8). Flag on any change to magic-link or rate-limit.

## No `UseForwardedHeaders` in `Program.cs`

- Behind reverse proxy, `RemoteIpAddress` = proxy IP → rate limiter collapses.
- Fix needs trusted-proxy allowlist. Flag on deployment/proxy changes.

## JWT Secret Guard

- Fires only for `IsProduction`. A `Staging` env can boot with weak/missing JWT secret.
- Low risk; note if Staging becomes real.

## Fail-Loud Config Guard Pattern

- When reviewing any `IsConfigured` or startup guard, enumerate **every** secret the
  feature depends on and confirm each is in the guard, not just the "obvious" ones.
- Names missing keys, never echoes values.

## Email Delivery Seam

- `IEmailService` → `EmailService` (Infrastructure) branches on `IsDevelopment()`.
- Dev: writes `DevelopmentEmails/*.html`. Prod: FluentEmail SMTP.
- A delivery-only change touches Infrastructure + config only — **no Kiota/frontend change needed**.

## High-Risk Files (auth/secret/redirect/rate-limit)

Read these in full for any auth-adjacent change:

- `Tidansu.API/Extensions/WebApplicationBuilderExtensions.cs` — JWT validation, rate limit, CORS, secret guard
- `Tidansu.API/Program.cs` — pipeline order, HSTS/HTTPS, security headers
- `Tidansu.API/Middlewares/ErrorHandlingMiddleware.cs` — domain-exception → HTTP mapping
- `Tidansu.Infrastructure/Extensions/ServiceCollectionExtensions.cs` — DI composition root
- `Tidansu.Infrastructure/Services/EmailService.cs` + `MagicLinkEmailSender.cs`
- `Tidansu.Application/Auth/Commands/**` — Request/Consume/Refresh handlers
- `Tidansu.App/src/utils/returnUrl.ts` — sole open-redirect guard

## Frontend UI Patterns

- **No toast system.** Transient messages held in Pinia store ref + inline banner.
  Alert: `rounded-card border border-warn/40 bg-warn/10 text-warn`.
  Info: `border-pro/30 bg-pro/5 text-pro`.
- **Modals:** `useModal()` → `{isOpen, open, close}`. `BaseModal` takes `:open` + `@close`.
- **Feature flags:** `src/config/featureFlags.ts` — `import.meta.env.VITE_* === 'true'`.
- **Base primitives:** `src/components/base/` — BaseButton, BaseBadge, BaseIcon, BaseModal,
  BaseCard, BaseText, BaseProgressBar, BaseEmptyState, BasePopoverMenu.
- **Plan data:** `src/data/plans.ts` — `planOf()`, `PLAN_FEATURES`, `isInf`.

## Kiota Regeneration

- Kiota needs a fresh `dotnet build` of the API before `build:api` or swagger is stale.
- Never hand-edit `src/api/apiClient/`. Guard in `.pi/settings.json` hooks.

## Verification (no test suite)

- `dotnet build` (whole solution) — static gate
- `npm run build` (vue-tsc) — type gate
- Drive the real app — behavioural gate
- For plan-gated features: verify both allowed path AND cap path (paywall opens with
  correct `reason`), plus downgrade read-only behaviour.

## Stripe Webhook Trust Seam

- Free-Pro prod leak: DI fallback when Stripe unconfigured is `DirectBillingService`
  (flips Pro with no payment). Fine in Development; Production must use
  `DisabledBillingService` (clean "billing unavailable").
- Webhook = ONLY Pro authority. Never grant Pro from client input.
- Idempotency must be atomic (claim + mutation in one unit of work).
- Downgrade read-only: `PlanPolicy.CheckSpaceMutation` already handles it.

## Convention: No-Hex / Token Scope

- "No hardcoded hex, use `@theme` tokens" applies to **Vue component color** styling only.
- Arbitrary pixel sizes (`text-[13px]`, `size-7`, `rounded-[6px]`) are established
  convention — NOT violations.
- Inline hex in backend email HTML is exempt (email clients need inline styles).

## Config Fail-Loud & Secret Logging

- New prod-required config → add startup guard (fail loud, name missing key, never echo value).
- Bearer credentials never in logs — only recipient email.
- Delivery/provider failures → sanitized domain exception (recipient only).
