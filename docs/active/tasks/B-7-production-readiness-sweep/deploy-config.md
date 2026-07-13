# B-7 · Deploy-time configuration

Every environment-driven setting a production deploy of Tidansu must supply,
what happens if it's left blank/missing, and whether that failure is loud
(startup crash naming the key) or a silent degrade. All keys use the standard
ASP.NET Core `Section__Key` double-underscore environment-variable convention.

| Setting | Required in Production? | Blank/missing consequence | Fails loud? |
|---|---|---|---|
| `JwtSettings__Secret` | Yes (≥32 chars) | Every JWT-signed session (access/refresh tokens) would be forgeable or unverifiable. | ✅ Yes — startup crash, `JwtSettings:Secret is missing or shorter than 32 characters.` (pre-existing guard) |
| `ConnectionStrings__TidansuDb` | Yes | App would boot, skip the automatic migration (`Program.cs`), and every request touching the database would 500 — a silent half-start. | ✅ Yes — startup crash, `ConnectionStrings:TidansuDb is missing.` (BA-2, new this sweep) |
| `AppSettings__FrontendUrl` | Yes | Every magic-link and Stripe Checkout return URL would be built from an empty base (broken links); CORS would previously have booted with a zero-origin policy. | ✅ Yes — startup crash, `AppSettings:FrontendUrl is missing.` (BA-1, new this sweep) |
| `SmtpSettings__Host` | Yes | No outbound mail server to connect to — magic-link/sign-in emails cannot send. | ✅ Yes — startup crash, `SmtpSettings:Host is missing.` (pre-existing guard) |
| `SmtpSettings__Username` | Yes | SMTP auth fails for every send attempt. | ✅ Yes — startup crash, `SmtpSettings:Username is missing.` (pre-existing guard) |
| `SmtpSettings__Password` | Yes | SMTP auth fails for every send attempt. | ✅ Yes — startup crash, `SmtpSettings:Password is missing.` (pre-existing guard) |
| `SmtpSettings__Port` | Yes | No valid port to connect to. | ✅ Yes — startup crash, `SmtpSettings:Port is missing or not a valid integer.` (pre-existing guard) |
| `SmtpSettings__EnableSsl` | Yes | Can't determine whether to negotiate TLS with the mail provider. | ✅ Yes — startup crash, `SmtpSettings:EnableSsl is missing or not a valid boolean.` (pre-existing guard) |
| `StripeSettings__Enabled` | Only if billing is turned on | Defaults to `false` → billing seam resolves to `DisabledBillingService` in Production (deliberate off, no free Pro). Not itself a failure — see `SecretKey`/`WebhookSecret`/`ProPriceId` below for what happens once `Enabled=true`. | N/A when `false`/unset |
| `StripeSettings__SecretKey` | Only if `Enabled=true` | Stripe API calls cannot authenticate. | ✅ Yes, when `Enabled=true` — startup crash naming every missing Stripe key together (pre-existing guard) |
| `StripeSettings__WebhookSecret` | Only if `Enabled=true` | Incoming Stripe webhooks cannot be signature-verified (a spoofed webhook could otherwise grant Pro for free). | ✅ Yes, when `Enabled=true` (pre-existing guard) |
| `StripeSettings__ProPriceId` | Only if `Enabled=true` | Checkout sessions have no Pro price to sell. | ✅ Yes, when `Enabled=true` (pre-existing guard) |
| `StripeSettings__SuccessUrl` / `StripeSettings__CancelUrl` | Only if `Enabled=true` | Checkout return redirects would be malformed/relative. Not covered by the existing fail-loud `IsConfigured` check (only `SecretKey`/`WebhookSecret`/`ProPriceId` are) — out of scope for this sweep's guard extension; noted here for completeness. | ⚠️ Not currently guarded — a pre-existing gap, not introduced by B-7; consider for a future hardening pass if it proves to matter in practice. |
| `ForwardedHeaders__KnownProxies` | Recommended once behind a reverse proxy/load balancer | Blank/absent → the framework loopback-only default is kept (fail safe): the auth/magic-link rate limiter partitions on the proxy's own address, so **every real visitor behind that proxy shares one rate-limit bucket** — the limiter becomes either useless (never trips) or locks everyone out together, depending on traffic. A literal `"*"` is rejected at startup rather than silently trusting everyone. | ⚠️ Partially — a wildcard fails loud; a merely-blank value degrades silently to the shared-bucket behaviour described above (this is the deliberate fail-safe default, but it is **not** the same as "correctly configured"). **📋 Open deploy step** — see the proof checklist FR-10 row. |
| `ForwardedHeaders__KnownNetworks` | Recommended once behind a reverse proxy/load balancer | Same as `KnownProxies` above, for CIDR ranges instead of single IPs. | Same as above. |

## Notes

- **`appsettings.Development.json` is not a template for production values.** Its
  `JwtSettings:Secret` and LocalDB connection string are clearly dev-only and are
  never loaded when `ASPNETCORE_ENVIRONMENT=Production`.
- **Switching environments requires zero code changes** — every value above is
  read from `IConfiguration` at startup; there is no `#if`/hardcoded environment
  branch anywhere in the composition root that would need editing per deploy.
- For the Brevo (email) and Stripe account setup steps themselves, see
  `docs/active/tasks/B-4-real-login-email/SETUP.md` and
  `docs/active/tasks/B-6-connect-real-stripe/go-live-cutover.md` respectively.
