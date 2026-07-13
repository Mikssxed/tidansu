# B-7 · Production-readiness sweep — Technical Tasks

Developer-ready plan for the verification-and-hardening sweep. **Read
`requirements.md` (13 FRs) and the `## Owner decisions` block in `task.md` first —
they are binding.** This is **not feature work**: the sweep is ~90% inspection /
verification / documentation, plus **four small config-hardening code edits**
(FR-5 fail-loud guards, FR-10 env-driven proxy trust, FR-11 Serilog + devtools).

**Owner decisions already baked into this plan (do not re-litigate):**
1. **Run now, mark E2E pending.** FR-2 (real Brevo email) and FR-3 (live
   Stripe test-mode) legs are recorded as **"pending owner action"** in the proof
   checklist — no task here requires a live Brevo/Stripe account to complete.
2. **Single origin.** CORS (FR-6) is defence-in-depth only → **verify
   fail-closed**, do NOT build multi-origin support.
3. **Reverse proxy unknown.** FR-10 → make trusted-proxy config **env-driven**,
   record the actual address as an **open deploy step**; never hardcode, never
   wildcard.

**No migration is expected in this task, and I agree there should be none.** No
task adds/removes/changes an entity field or the `TidansuDbContext` model — the
only C# edits are to the composition root (`Program.cs`,
`WebApplicationBuilderExtensions.cs`, `ServiceCollectionExtensions.cs`) and
config files. If a developer finds themselves writing `dotnet ef migrations add`,
they have gone out of scope — stop and re-read the requirements.

> **Each task is tagged `[code edit]`, `[verify]`, or `[doc]`** so the split is
> unambiguous. Every code edit here touches **startup/auth/config surfaces** and
> is a **Stage-3 pause point** (security-reviewer runs alongside the branch
> reviewer, per `task.md`).

---

## Top-of-file callouts (read before starting)

### 🔴 / 🟠 Security items to keep front-of-mind
- 🔴 **FrontendUrl blank in prod = every magic link and Checkout return URL is
  broken, and CORS silently allows nothing (or, if later widened wrong, allows
  everything).** FR-5 must make a blank `AppSettings:FrontendUrl` a **fail-loud
  startup crash** in Production, mirroring the JWT/SMTP guards. (Task BA-1.)
- 🔴 **Connection string blank in prod = app boots, migration is skipped
  (`Program.cs` line 19), first request 500s.** FR-5 must fail loud at startup on
  a blank `TidansuDb` in Production. (Task BA-2.)
- 🔴 **Forwarded-header trust must never become a wildcard.** FR-10 binds
  `KnownProxies`/`KnownNetworks` from config; the code must **add** parsed
  entries, never `KnownProxies.Clear()`-then-trust-all and never accept `"*"`.
  Blank config → keep the framework loopback-only default (fail safe). (Task BA-3.)
- 🟠 **Auth bypass / dev-email-file / dev magic-link must be proven absent from
  the *built artifact*, not just the source.** Owner decision requires
  build-output inspection (grep `wwwroot` bundle; run under
  `ASPNETCORE_ENVIRONMENT=Production`), not a source read. (Tasks V-3…V-6.)

### ❓ Open Questions (resolve or record as "pending" — do not block the sweep)
See the **❓ Open Questions** section at the bottom — the load-bearing ones are
the launch domain value (FR-6), the production proxy topology (FR-10, explicitly
left open per owner decision), and whether FR-12 rough-edges are auto-filed or
batched (owner leaned **batch for review**).

---

## What already holds today (verified during requirements — you are *confirming*, not building)

- **Auth bypass** is `import.meta.env.DEV && VITE_DISABLE_AUTH === 'true'` in
  `src/Tidansu.App/src/router/index.ts:55` → statically `false` under
  `vite build`, dead-code-eliminated. Flag lives in `.env.development` (loaded
  only by `vite dev`), not `.env`.
- **Dev email-to-file** is gated on `environment.IsDevelopment()` in
  `EmailService.cs:24`; the prod branch attempts a real send and throws
  `EmailDeliveryException` on failure (no silent success).
- **Dev magic-link (`devLink`)** is returned only when
  `environment.IsDevelopment()` in `MagicLinkEmailSender.cs:24`; prod returns
  `null`.
- **Fail-loud guards** already exist for `JwtSettings:Secret`
  (`WebApplicationBuilderExtensions.cs:33`), SMTP creds, and Stripe
  (`ServiceCollectionExtensions.cs:64-116`).
- **CORS already fails closed:** blank `AppSettings:FrontendUrl` adds **no**
  origins (`WebApplicationBuilderExtensions.cs:73`), so cross-origin is refused
  by default.
- **Two gaps to close (FR-5):** no fail-loud guard on `AppSettings:FrontendUrl`
  or the `TidansuDb` connection string. **One gap to close (FR-10):**
  `ForwardedHeadersOptions.KnownProxies/KnownNetworks` are framework-default
  (loopback-only) and not env-driven. **Two hygiene items (FR-11):** confirm
  `vite-plugin-vue-devtools` self-excludes from `build`; turn EF Core Serilog
  down from `Information` in the base `appsettings.json`.

---

## 📋 Technical Tasks

### Backend — API / Composition root (the only code edits)

- [x] **BA-1 · [code edit] · modify** the CORS/config setup to fail loud on a
      blank `AppSettings:FrontendUrl` in Production, in
      `src/Tidansu.API/Extensions/WebApplicationBuilderExtensions.cs`
      (`AddPresentation`, near the existing `frontendUrl` read at line 68).
      Add a guard modeled exactly on the `JwtSettings:Secret` guard (lines 33-37):
      if `builder.Environment.IsProduction()` and
      `string.IsNullOrWhiteSpace(frontendUrl)`, throw
      `InvalidOperationException("AppSettings:FrontendUrl is missing. Set the
      AppSettings__FrontendUrl environment variable.")`. Place it **before**
      `AddCors` so the app refuses to boot rather than start with broken magic
      links + a no-origin CORS policy. Do **not** echo the value.
      *(FR-5. This is the one auth-adjacent value — magic-link + Checkout return
      URLs are built from it — so it is genuinely fail-loud-worthy.)*
      🔴 auth-adjacent config · Stage-3 pause point.

- [x] **BA-2 · [code edit] · modify** the DbContext registration to fail loud on
      a blank `TidansuDb` connection string in Production, in
      `src/Tidansu.Infrastructure/Extensions/ServiceCollectionExtensions.cs`
      (`AddInfrastructure`, at the `connectionString` read on line 22). If
      `environment.IsProduction()` and
      `string.IsNullOrWhiteSpace(connectionString)`, throw
      `InvalidOperationException("ConnectionStrings:TidansuDb is missing. Set the
      ConnectionStrings__TidansuDb environment variable.")` **before**
      `AddDbContext`. Keep the current permissive behaviour in non-Production
      (the swagger CLI + Development boot with an empty connection string relies
      on it — see the Kiota regen fallback in project memory). Do **not** echo
      the value.
      *(FR-5. Closes the "app boots, migration skipped in `Program.cs:19`, first
      request 500s" gap.)* 🔴 config · Stage-3 pause point.

- [x] **BA-3 · [code edit] · modify** the forwarded-headers setup to bind
      `KnownProxies`/`KnownNetworks` from configuration, in
      `src/Tidansu.API/Program.cs` (the `UseForwardedHeaders` block at lines
      35-38, under the existing `// SECURITY (B-7)` comment). Read two optional
      config sections — e.g. `ForwardedHeaders:KnownProxies` (array of IP
      strings) and `ForwardedHeaders:KnownNetworks` (array of CIDR strings like
      `10.0.0.0/8`) — parse each with `IPAddress.Parse` /
      `IPNetwork.Parse` and **add** them to `options.KnownProxies` /
      `options.KnownNetworks`. **Rules (all mandatory):** when both sections are
      absent/empty, change nothing (keep the framework loopback-only default —
      fail safe); **never** call `.Clear()` then trust everything; **reject a
      literal `"*"`/`0.0.0.0/0`** (throw a clear `InvalidOperationException` — a
      wildcard here defeats the rate limiter entirely). Update the existing
      `// SECURITY (B-7)` comment to say the config keys now exist and the actual
      trusted address is a **deploy-time** value.
      *(FR-10. Owner decision OQ-3: wire it env-driven, leave the real address to
      deploy time.)* 🔴 rate-limiter / auth abuse surface · Stage-3 pause point.

- [x] **BA-4 · [code edit] · modify** the base production Serilog level for EF
      Core in `src/Tidansu.API/appsettings.json` — change
      `Serilog:MinimumLevel:Override:"Microsoft.EntityFrameworkCore"` from
      `"Information"` to `"Warning"` (line 31). This is the **base** (production)
      config; `appsettings.Development.json` keeps `Information` for local
      debugging, so dev is unaffected. Leave `"Microsoft": "Warning"` as-is.
      *(FR-11. Stops routine per-query DB chatter in prod logs; errors/warnings
      stay visible.)* 🟢 log hygiene.

### Frontend — build hygiene

- [x] **FE-1 · [verify] (+ optional hardening) ·** confirm
      `vite-plugin-vue-devtools` does not inject its client into a `vite build`
      output. In `src/Tidansu.App/vite.config.ts` the plugin is registered
      unconditionally (`VueDevTools()`, line 9). Recent versions self-limit to
      `apply: 'serve'`, but **prove it from the artifact, not the docs**: run
      `npm run build` and grep the emitted `../Tidansu.API/wwwroot/assets/*.js`
      for `vue-devtools` / `__VUE_DEVTOOLS`. If any devtools client code is
      present, **[code edit]** harden by gating registration on serve mode
      (`command === 'serve' ? [VueDevTools()] : []` inside a `defineConfig`
      function form) and re-verify the grep is clean.
      *(FR-11. Verification-first; the edit only happens if the grep proves a
      leak.)* 🟢 build hygiene.

### Documentation / Deliverables

- [x] **DOC-1 · [doc] · create** the proof-checklist deliverable at
      `docs/active/tasks/B-7-production-readiness-sweep/proof-checklist.md`.
      This is **FR-1 + FR-13's primary artifact** and must be legible to the
      non-engineer product owner. One row per FR-1…FR-12 acceptance criterion,
      each recording **four columns**: *Requirement* · *What was proven* ·
      *How it was proven (exact steps / files / commands)* · *Status*
      (`✅ Verified <date>` | `⏳ Pending: <exactly what unblocks it>` |
      `📋 Open deploy step`). Seed it with:
      - FR-2 real email → `⏳ Pending owner Brevo setup` (names the
        `SmtpSettings__*` env vars + the B-4 setup guide).
      - FR-3 live Stripe test-mode → `⏳ Pending owner Stripe test-mode drive`
        (names the B-6 go-live/cutover doc).
      - FR-10 proxy trust → `📋 Open deploy step: set
        ForwardedHeaders__KnownProxies/KnownNetworks to the real production proxy
        once topology is known; verify two client IPs are rate-limited
        independently.`
      - FR-12 rough-edge log → a table (empty at start) that every finding from
        V-1 lands in, marked *fixed here* or *logged as backlog [id]*.
      All other FRs → filled in as their `[verify]` task below completes.
      *(FR-13. The checklist is a separate artifact from this `tech-tasks.md`.)*

- [x] **DOC-2 · [doc] · add** a "Deploy-time configuration" section to the
      checklist (or a sibling `deploy-config.md` in the task folder) enumerating
      **every environment-driven setting** a prod deploy must supply, with
      blank-value consequences: `JwtSettings__Secret`, `ConnectionStrings__TidansuDb`,
      `AppSettings__FrontendUrl`, `SmtpSettings__{Host,Username,Password,Port,EnableSsl}`,
      `StripeSettings__{Enabled,SecretKey,WebhookSecret,ProPriceId,SuccessUrl,CancelUrl}`,
      and `ForwardedHeaders__KnownProxies/KnownNetworks`. Note which fail loud at
      startup (JWT, SMTP, Stripe-when-enabled, and — after BA-1/BA-2 — FrontendUrl
      + connection string) vs. which merely degrade (proxy trust → shared
      rate-limit bucket). *(FR-4/FR-5/FR-10 — the env-driven-config evidence.)*

### Verification (no automated test suite — inspect build output + drive a prod-like run)

> **Prod-like run** = build the SPA (`npm run build` → `wwwroot`), then run the
> API with `ASPNETCORE_ENVIRONMENT=Production` and real env vars (a local SQL
> Server/LocalDB connection string, a Stripe **test-mode** key set if exercising
> billing, `AppSettings__FrontendUrl` = the API's own origin since SPA+API are
> same-origin). This is the config every V-task below drives against.

- [x] **V-1 · [verify] · FR-1 core-journey drive (prod-like config).** Serve the
      built SPA + API same-origin under `ASPNETCORE_ENVIRONMENT=Production`. Walk
      the full journey and record each step in the checklist:
      1. Request a magic link → sign in. *(Delivery itself is FR-2/pending; here
         confirm the request is accepted and — because it is prod — **no `devLink`
         appears in the response body**, see V-6. Use the DB-issued token or a
         real inbox if Brevo is wired.)*
      2. Create a space; add zones positioned on its layout; add items with and
         without expiry.
      3. Hit each Free cap and confirm the paywall opens with the **correct
         `reason`**: spaces (create a 3rd → `spaces`), zones (7th in a space →
         `zones`), items (51st in a space → `items`), photos (attempt a photo →
         `photos`), sync (attempt sync → `sync`).
      4. *(If Stripe test-mode configured)* upgrade to Pro and confirm caps lift;
         else record FR-3 as pending.
      Log anything broken/confusing to the FR-12 table (DOC-1) as you go.
      🔒 blocked by: BA-1…BA-4 (drive the hardened build).

- [x] **V-2 · [verify] · FR-5 fail-loud guards.** Boot the API under
      `ASPNETCORE_ENVIRONMENT=Production` **four times**, each with exactly one
      required setting blank: (a) `AppSettings__FrontendUrl` blank → refuses to
      start naming `AppSettings:FrontendUrl` (BA-1); (b) `ConnectionStrings__TidansuDb`
      blank → refuses to start naming `ConnectionStrings:TidansuDb` (BA-2); (c)
      `JwtSettings__Secret` blank → existing guard fires; (d)
      `StripeSettings__Enabled=true` with a blank `SecretKey` → existing guard
      fires. In every case confirm the message **names the key and echoes no
      value**. 🔒 blocked by: BA-1, BA-2.

- [x] **V-3 · [verify] · FR-6 CORS fails closed.** In the prod-like run with
      `AppSettings__FrontendUrl` **blank** (or set to the API origin), issue a
      cross-origin request from a different origin (curl with an `Origin:
      https://evil.example` header, or a browser fetch from another host) → confirm
      it is **rejected** (no `Access-Control-Allow-Origin` echoed). Then set
      `AppSettings__FrontendUrl` to the real launch origin and confirm a
      same-origin request succeeds. Record the confirmed launch domain in the
      checklist (Open Question OQ-2 answer). *(No code change — verifying existing
      fail-closed behaviour per owner decision.)*

- [x] **V-4 · [verify] · FR-7 auth bypass compiled out.** Run `npm run build` and
      grep the emitted `src/Tidansu.API/wwwroot/assets/*.js` for
      `VITE_DISABLE_AUTH`, `authDisabled`, and the bypass branch → confirm **no
      trace** (the `import.meta.env.DEV` gate dead-code-eliminates it). Then load
      the built app under the prod-like run and confirm every `requiresAuth` route
      redirects to `/login` when unauthenticated, **regardless** of any
      `VITE_DISABLE_AUTH` value in the runtime environment (it is baked at build
      time, so runtime env cannot re-enable it). 🟠 highest-stakes shortcut.

- [x] **V-5 · [verify] · FR-8 dev email-file path inert in prod.** In the
      prod-like run, request a magic link and confirm **no file** is written to
      `DevelopmentEmails/` (the `IsDevelopment()` branch in `EmailService.cs:24`
      is skipped). Then force a delivery failure (point `SmtpSettings__Host` at an
      unreachable host) and confirm the caller gets a **clear error**
      (`EmailDeliveryException` → sanitized 5xx via `ErrorHandlingMiddleware`),
      **not** a silent 200, and that the log names only the recipient + reason (no
      body/link/creds).

- [x] **V-6 · [verify] · FR-9 no dev magic-link in prod response.** In the
      prod-like run, POST the magic-link request endpoint and inspect the response
      body → confirm it contains **no link and no token** (`DevLink` is `null`
      because `MagicLinkEmailSender.cs:24` returns `null` outside Development).
      Contrast with a Development run where `devLink` is present, to prove the gate
      is the environment, not an accident.

- [x] **V-7 · [verify] · FR-11 build/log hygiene.** (a) Confirm the FE-1 grep of
      `wwwroot/assets/*.js` shows no devtools client. (b) Run the prod-like API,
      exercise a few DB reads/writes, and confirm the console/file logs show **no
      per-query EF Core SQL at Information** (BA-4 turned it to Warning), while
      an intentionally-triggered EF error still logs. 🔒 blocked by: BA-4, FE-1.

- [x] **V-8 · [verify] · FR-4 no secrets in source.** Grep the repo for committed
      production secrets — `git grep -iE "sk_live|sk_test|whsec_|password\"\s*:\s*\"[^\"]+"`
      across `appsettings*.json` and history — and confirm only blank
      placeholders or the clearly dev-only `JwtSettings:Secret` in
      `appsettings.Development.json` appear. Record the result in the checklist.
      *(FR-4 acceptance: repository contains no production secret value.)*

- [x] **V-9 · [verify] · builds green.** `dotnet build` of the solution is green
      after BA-1/BA-2/BA-3/BA-4; `npm run build` (vue-tsc type-check) is green
      after FE-1. Run **last**, after all edits. 🔒 blocked by: all BA-* + FE-1.

### Rough-edge triage (FR-12)

- [x] **V-10 · [verify/triage] · FR-12 rough-edge disposition.** For every issue
      logged to the FR-12 table during V-1: if trivial UI/copy → note it for the
      owner batch (owner leaned **batch, not auto-file** — OQ-4). If it reads as a
      **security or scalability** concern (authz/IDOR gaps, N+1, missing indexes,
      load) → **do not fix here**; name it and hand off to **B-8**. Confirm the
      checklist leaves **no finding unaccounted for** before the sweep closes.

### Refactoring

- [x] **[refactor]** No refactoring needed in touched files. The composition-root
      edits (BA-1…BA-3) extend an already-consistent fail-loud pattern; adding a
      guard mirroring the existing JWT/SMTP guards *is* the DRY choice. Do not
      abstract a shared "guard helper" for two call sites — the existing
      `RequireSmtpSetting` local is scoped to SMTP and copying its shape is
      clearer than a premature shared abstraction. (Three guards is the threshold
      to consider extracting one; BA-1/BA-2 bring us to two — leave it.)
      `appsettings.json` and `vite.config.ts` edits are config, not code.

---

## 🔒 Security Considerations

- **Blank `FrontendUrl` in production (🔴 Critical).** Breaks every magic link
  and Checkout return URL, and leaves CORS with a zero-origin policy that a later
  careless "fix" could widen to `*`.
  - [x] BA-1 fails loud at startup on blank `AppSettings:FrontendUrl` in
        Production; V-2 proves it; V-3 proves CORS still fails closed.

- **Blank DB connection string in production (🔴 Critical).** App boots,
  migration is skipped, first request 500s — a silent half-start.
  - [x] BA-2 fails loud at startup on blank `TidansuDb` in Production; V-2 proves
        it.

- **Forwarded-header trust widened to a wildcard (🔴 Critical).** A wildcard/
  `Clear()`-then-trust-all lets any client spoof `X-Forwarded-For` and dodge the
  magic-link rate limiter entirely (the abuse control the limiter exists for).
  - [x] BA-3 only **adds** explicitly-configured proxies/networks, rejects `"*"`,
        and keeps the loopback-only default when config is blank (fail safe). The
        real address is a documented **deploy step** (DOC-1/DOC-2), never
        hardcoded.

- **Auth bypass reaching the shipped bundle (🟠 High).** Would let anyone browse
  as signed-in.
  - [x] V-4 proves the bypass is absent from the built `wwwroot` artifact and
        cannot be re-enabled by any runtime env var.

- **Dev email-file / dev magic-link leaking into prod (🟠 High).** Either would
  silently break sign-in or hand an attacker a token via the API response.
  - [x] V-5 (no file written, real send attempted, clear error on failure) and
        V-6 (no link/token in the prod response body) prove both gates hold under
        the exact `ASPNETCORE_ENVIRONMENT=Production` that will deploy.

- **Secret echoed in a fail-loud message or a log line (🟠 High).** The new
  guards must name the *key*, never the value.
  - [x] BA-1/BA-2/BA-3 messages name keys only (mirror the JWT/SMTP guards); V-2
        confirms no value is echoed. Aligns with the existing
        `config-fail-loud-and-secret-logging` convention.

- **Committed production secret (🔴 Critical if present).**
  - [x] V-8 greps source + history; confirm only blank placeholders / dev-only
        values exist.

- **Deep authz/IDOR review is explicitly out of scope (deferred).** Any
  ownership-check or IDOR concern found during V-1 → hand to **B-8**, do not fix
  here (V-10).

## 📈 Scalability / Correctness Considerations

- **Rate-limit bucket collapse behind a real proxy.** Until FR-10's proxy address
  is set at deploy time, every user behind the proxy shares one `unknown`/proxy-IP
  bucket, so the magic-link limiter is either useless or locks everyone out
  together.
  - [x] BA-3 makes the trusted set env-driven; DOC-1/DOC-2 record the deploy step
        and the manual "two client IPs limited independently" check as an **open
        deploy step**, not a "done".

- **EF Core Information-level query logging in prod.** Bloats log storage and
  buries real signal; marginal correctness risk if a query logs parameter values.
  - [x] BA-4 drops EF Core to Warning in the base config; V-7 confirms no
        per-query chatter while errors remain visible.

- **This sweep does NOT own N+1 / missing-index / load review.** Those are B-8.
  Flag, don't fix (V-10).

## 📦 New Dependencies

No new dependencies required. All FR-10 work uses framework types already
available (`Microsoft.AspNetCore.HttpOverrides.ForwardedHeadersOptions`,
`System.Net.IPAddress`/`IPNetwork`); FR-5 uses the existing configuration +
`InvalidOperationException` pattern; FR-11 is a config value change plus (if
needed) a conditional in the existing `vite.config.ts`. **No Kiota regeneration
is required** — no controller signature, request/response DTO, or route changes
in this task (the only C# edits are startup guards and config binding, none of
which touch the OpenAPI surface).

## ❓ Open Questions

1. **Launch domain value (FR-6/OQ-2).** What is the exact production origin the
   built SPA + API are served from? Needed to set `AppSettings__FrontendUrl` and
   to record FR-6 as verified. *(Recorded in the checklist; can be filled at
   deploy time — does not block the code edits.)*
2. **Production reverse-proxy topology (FR-10/OQ-3).** Explicitly left open by
   owner decision. FR-10 ships env-driven; the real
   `ForwardedHeaders__KnownProxies/KnownNetworks` value and the "two client IPs
   limited independently" check are an **open deploy step** in the checklist —
   not closeable in this sweep.
3. **FR-12 rough-edge disposition (OQ-4).** Owner leaned **batch findings for
   review** rather than auto-filing. Confirm before filing any GitHub issue; until
   then, collect them in the DOC-1 FR-12 table.
4. **FR-2 / FR-3 timing (OQ-1, decided).** Both recorded as "pending owner
   action" — no task here attempts a live Brevo send or a Stripe test-mode
   purchase. Confirm the owner still wants the sweep to close with these pending
   (per the Stage-1 decision, yes).
5. **Sending domain (SPF/DKIM/DMARC) (OQ-5).** Out of scope for this sweep
   (recommended post-sweep follow-up); note it in the checklist as a known
   deliverability caveat behind FR-2, no task here.
