# B-8 · Security Audit (SECURITY lens only)

**Date:** 2026-07-14
**Scope:** Whole-codebase, `main` (clean/merged — audited existing code, not a diff).
**Auditor:** security-reviewer (whole-codebase mode)
**Type:** Findings report only — no code changes made.
**Note:** Scalability (N+1/index/payload-size/perf) and UI/UX correctness are owned by
a separate pass and deliberately excluded here. Where a finding straddles the
security/scalability line (e.g. photo payload size), it is scoped to its security
dimension and the overlap is flagged for the other pass.

## Summary count

**0 Critical · 2 Major · 6 Minor**

- 🟠 **S-1** — Free 2-space cap bypassable via concurrent create (TOCTOU race).
- 🟠 **S-2** — No content-type/size/field validation on user-supplied space graph
  (`Item.Photo` is uncapped `nvarchar(max)`; zone/item fields unvalidated).
- 🟡 S-3 … S-8 — client-supplied primary keys, unvalidated `ZoneId`, `IsProduction`-scoped
  guards, localStorage token storage, stale `SyncOn` on downgrade, ForwardedHeaders CIDR edge.

## Surface-by-surface verdict

| Surface | Verdict |
|---|---|
| IDOR / ownership | ✅ Verified clean |
| Plan-limit bypass | 🟠 S-1 (space-count race); server-side enforcement otherwise clean |
| Auth / token handling | ✅ Clean; 🟡 S-5, S-6 hardening |
| Billing / webhook integrity | ✅ Verified clean (prior B-6 `WebhookSecret` gap is now FIXED) |
| Input validation | 🟠 S-2; 🟡 S-3, S-4 |
| Redirect safety | ✅ Verified clean |

---

## Verified clean (with evidence)

**IDOR / ownership — clean.** Every spaces read/mutate is scoped by the authenticated
user id at the *query* level, not filtered post-load:
- `SpacesRepository.GetByIdAsync(id, userId)` filters `s.Id == id && s.UserId == userId`
  (`SpacesRepository.cs:18-24`); `GetAllByUserAsync`, `CountByUserAsync` likewise.
- All five handlers resolve `userId = userContext.GetCurrentUser().Id` from the JWT
  `NameIdentifier` claim and pass it into the repo — `GetSpaceQueryHandler.cs:15-17`,
  `GetSpacesQueryHandler.cs:14-15`, `UpdateSpaceCommandHandler.cs:20-21`,
  `DeleteSpaceCommandHandler.cs:16-17`, `CreateSpaceCommandHandler.cs:20`. A guessed/other
  user's space id returns `NotFoundException` (404), never another tenant's data.
- Zones/items have no standalone controller — they are only ever reached through their
  owning space, so there is no unscoped child endpoint to abuse.

**Billing / webhook integrity — clean.** `StripeBillingService.HandleWebhookAsync`
verifies the Stripe signature as its first statement (`EventUtility.ConstructEvent`,
`StripeBillingService.cs:147`); a forged/absent signature throws `ValidationException`
→ 400 before any mutation. `BillingController` reads the raw `Request.Body`
(`BillingController.cs:19-21`) with no model binding, and `Program.cs` has no
body-buffering middleware ahead of it. Account mapping uses only the server-set
`ClientReferenceId = user.Id` (`StripeBillingService.cs:105,215`) or stored
subscription/customer ids, never client email. Idempotency claim + plan mutation share
one explicit DB transaction (`ProcessOnceAsync`, `StripeBillingService.cs:190-209`), so
Stripe's at-least-once retries are safe no-ops and a mid-handler failure rolls the claim
back. **The B-6 review's open gap (S-H1: `WebhookSecret` missing from `IsConfigured` and
the fail-loud startup guard) is now FIXED** — `StripeSettings.IsConfigured` requires
`WebhookSecret` (`StripeSettings.cs:23-27`) and the startup guard names it when missing
(`Infrastructure/…/ServiceCollectionExtensions.cs:117-129`). Webhook body-cap + a
dedicated rate-limit remain carved off to **[B-9]** — not re-filed here.

**Auth / token handling — clean.** Magic-link + refresh tokens are stored only as
`SHA256` hashes (`JwtService.HashRefreshToken`, `JwtService.cs:54-58`); the raw token is
never persisted. Magic links are single-use and **burned before** JWTs are issued
(`ConsumeMagicLinkCommandHandler.cs:27-29`), 15-min lifetime with supersede-on-resend
(`RequestMagicLinkCommandHandler.cs:18,36`). Refresh rotation revokes the presented token
and issues a fresh pair in one `SaveChanges` (`RefreshTokenCommandHandler.cs:29-39`); a
replayed rotated token is `!IsActive` → rejected. Auth endpoints are rate-limited
(`magic-link` 3/min, `auth` 10/min per IP — `AuthController.cs:22,33,44`) and Identity
lockout is on (5 attempts / 5 min — `ServiceCollectionExtensions.cs:47-53`). JWT
validation is full and strict with `ClockSkew = TimeSpan.Zero`
(`WebApplicationBuilderExtensions.cs:49-59`). No committed prod secret — the dev JWT
secret lives only in `appsettings.Development.json`; prod requires `JwtSettings__Secret`
(≥32 chars, guarded).

**Redirect safety — clean.** `returnUrl` is validated by `safeReturnUrl`
(`utils/returnUrl.ts:11-16`) — rejects absolute and protocol-relative (`//`, `/\`) URLs —
and it is applied on *both* the request path (`LoginView.vue:164`) and the consume/redirect
path (`LoginView.vue:197,211`). The backend only `Uri.EscapeDataString`s the value into the
email link (`MagicLinkEmailSender.cs:16-20`), so there is no header/HTML injection and no
server-side open redirect.

**Injection — clean.** No raw SQL anywhere (`FromSql`/`ExecuteSql`/`SqlQuery` grep is
empty); all data access is EF Core LINQ, parameterized. Photos are stored as strings in
the DB, not as file paths or storage keys, so there is no path-traversal surface.

---

## Security findings

### 🟠 Major

**S-1 — Free 2-space cap bypassable via a concurrent-create race (TOCTOU)**
`CreateSpaceCommandHandler.cs:26-34`. The handler reads
`existingCount = CountByUserAsync(userId)` then, in a *separate* non-locking DB round-trip,
`AddAsync(entity)`. There is no unique/count constraint enforcing the cap in the schema.
**Scenario:** a Free user at 1 space fires N concurrent `POST /api/spaces`. Each request
reads count = 1 (< 2 → passes `CheckNewSpace`) before any insert commits, and all N insert
→ the account ends with `1 + N` spaces, exceeding the paid 2-space cap with no client
workaround needed beyond parallel requests. Zone/item caps are *not* affected (they gate on
the whole submitted graph inside one request), so this is specific to the cross-request
space count. **Fix:** enforce the count check and insert in one serializable transaction, or
add a guarded/atomic count (e.g. re-check inside a `SERIALIZABLE` tx, or a DB-level
per-user space-count constraint), so concurrent creates can't both pass the gate.
**Candidate backlog item:** *"Close the Free space-cap concurrency race — enforce
space-count limit atomically (serializable tx or DB constraint) in CreateSpace so parallel
POSTs can't exceed 2 spaces."*

**S-2 — Space graph accepted without content-type / size / field validation**
`ItemDto.cs:14` + `TidansuDbContext.cs:104` (`Photo` intentionally `nvarchar(max)`),
`CreateSpaceCommandValidator.cs:12-14`, `UpdateSpaceCommandValidator.cs:13-15`. The Create/
Update validators bound only `Space.Id/Name/Type`; the `Zones` and `Items` collections and
all their fields are unvalidated at the application layer. Most string fields are capped at
the DB layer (so an over-long value 500s via `DbUpdateException` rather than a clean 400),
but **`Item.Photo` has no cap at any layer and no content-type check**. **Scenario:** a Pro
user (photos allowed) submits items whose `Photo` strings are large arbitrary data URLs
(or non-image/`javascript:`/`data:text/html` payloads); each is stored verbatim in
`nvarchar(max)` with no type or length guard, letting one account bloat storage and later
response bodies, and storing unvalidated pseudo-URLs that the SPA renders as `img` sources.
The house checklist explicitly requires validating photo content-type and size. **Fix:**
add FluentValidation rules for the zone/item collections and fields (lengths matching the
DB `HasMaxLength`, tag count/length bounds), and specifically validate `Photo` as an
allow-listed image content-type with a hard per-photo byte cap; reject oversize/malformed
input as 400 rather than storing it or 500-ing. **Overlap note:** the *aggregate* payload
size (whole-request byte cap / unbounded rows) is a scalability concern — leave that
dimension to the scalability pass; this finding is the missing *validation* only.
**Candidate backlog item:** *"Add FluentValidation coverage for the space zone/item graph +
photo content-type/size validation (reject, don't store) so oversized/malformed items 400
instead of 500-ing or bloating storage."*

### 🟡 Minor / hardening

**S-3 — Client-supplied primary keys (mass assignment of `Id`)**
`SpaceDto.cs:31,41-42`, `ItemDto.cs:37`, `ZoneDto.cs:45` — `ToEntity` copies the
client-supplied `Id` straight onto the entity, and `CreateSpaceCommandHandler.cs:33`
inserts it. Ids are validated only for length/non-empty, not ownership or server origin.
**Scenario:** a client supplies a `Space.Id` (or, on update, a `Zone.Id`/`Item.Id`) that
collides with a row already in the global table (possibly another tenant's) → PK violation
→ `DbUpdateException` → generic 500. This is a weak cross-tenant *existence oracle* (500 vs
success) and an integrity foot-gun; it is **not** an overwrite (inserts never update another
row) and ids are random client-generated so not enumerable — hence Minor. **Fix:** generate
ids server-side, or scope uniqueness per user and translate collisions to a clean
validation error rather than a 500.

**S-4 — `Item.ZoneId` not validated to reference a zone in the same space**
`ItemDto.cs:37` — `ZoneId` is stored as an opaque string with no check that it names a zone
in the submitted/owning space. **Scenario:** a user PUTs items whose `ZoneId` points at a
nonexistent or foreign zone id; the data persists inconsistently. Stays within the user's
own space (no cross-tenant access), so this is an integrity nit, not IDOR. **Fix:** validate
that every `Item.ZoneId` matches a `Zone.Id` present in the same space graph.

**S-5 — Fail-loud secret guards scoped to `IsProduction()` (Staging boots weak)**
`WebApplicationBuilderExtensions.cs:33` (JWT secret ≥32 guard) fires only when the env is
exactly `"Production"`. A mis-named internet-facing env (`Staging`, a typo) skips the guard.
Mitigating: an *empty* secret makes `AddAuthentication()` register no bearer handler → all
`[Authorize]` endpoints fail closed (401), and `ASPNETCORE_ENVIRONMENT` unset defaults to
Production, so a bare deploy is safe. Recurring pattern (see the SMTP/connection-string
guards, which already use `!IsDevelopment()`). **Fix:** scope the JWT-secret guard to
`!IsDevelopment()` (or an explicit non-dev allowlist) for consistency.

**S-6 — Access + refresh tokens stored in `localStorage`**
`useAuthStore.ts:36` persists both JWT and refresh token to `localStorage`. Any XSS on the
SPA can exfiltrate a 7-day refresh token for durable account takeover, and refresh rotation
has no reuse-detection *family* revoke (a stolen token used before the victim just logs the
victim out). Vue's default escaping means no stored-XSS sink was found today, so this is a
standard SPA tradeoff rather than an active exploit. **Fix (hardening):** prefer an
httpOnly, SameSite refresh cookie, and/or add refresh-token reuse detection that revokes the
whole token family on replay.

**S-7 — Downgrade does not reset `user.SyncOn`**
`StripeBillingService.cs:294-297` (`OnSubscriptionDeletedAsync`) sets `Plan = Free` but
leaves `SyncOn` untouched, and `SetSyncCommandHandler.cs:25` only re-gates when *turning
sync on*. A user who enabled sync as Pro keeps `SyncOn = true` after lapsing to Free. Today
`SyncOn` is effectively a cosmetic flag (there is no separate server-enforced sync data path
to abuse), so impact is low — but if sync ever becomes a real server capability this is a
silent Pro-capability retention. **Fix:** reset `SyncOn = false` on the downgrade path (and/
or gate the eventual sync operation on the live plan, not just the stored flag).

**S-8 — ForwardedHeaders wildcard guard misses split full-coverage CIDR ranges**
`Program.cs:67-86`. The guard now rejects `*`, `0.0.0.0/0`, `::/0`, `::` (the IPv6 gap from
the B-7 review is FIXED). It still does not reject a `PrefixLength == 0` range expressed
differently, nor split full-coverage pairs (e.g. `0.0.0.0/1` + `128.0.0.0/1`). An operator
who trusts such a range re-opens `X-Forwarded-For` spoofing → rate-limit-partition evasion.
Deploy-config hardening only (no proxy address is configured yet — an open deploy step).
**Fix:** reject any parsed network whose `PrefixLength == 0` rather than string-matching
specific wildcard spellings.

---

## Verification checklist (for the S-1 / S-2 fixes)

- [ ] **S-1:** As a Free user with 1 existing space, fire ~20 concurrent
  `POST /api/spaces`; confirm the account never exceeds 2 spaces (expect 403 `plan:spaces`
  on the excess), both before and after the fix.
- [ ] **S-2:** POST an item with a 5 MB `Photo` string and with a non-image
  `Photo` (`javascript:…`, `data:text/html,…`); confirm a 400 (rejected, not stored) after
  the fix. POST an item `Name` of 10 000 chars; confirm a clean 400, not a 500.
- [ ] **S-3:** POST a space whose `Id` duplicates an existing space id; confirm a clean
  validation error, not a 500.
