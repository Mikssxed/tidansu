# B-8 · Security & Scalability Audit — Findings Report

**Date:** 2026-07-14
**Scope:** Whole-codebase, `main` (clean/merged — audited existing code, not a diff).
**Auditors:** `security-reviewer` (security lens) + `branch-code-reviewer` (scalability + UI/UX lenses).
**Type:** Findings report only. No code shipped under the audit itself; trivial fixes
may be applied inline per the task decision, Critical/Major deferred to follow-up backlog items.
**Severity rubric:** 🔴 Critical = exploitable now / data-exposure or auth-bypass ·
🟠 Major = exploitable under plausible conditions or a clear scalability cliff ·
🟡 Minor = hardening / nit.

Intermediate source reports (kept for detail): [`./audit-security.md`](./audit-security.md),
[`./audit-scalability-ux.md`](./audit-scalability-ux.md).

---

## Headline

**0 Critical · 8 Major · 9 Minor.** No exploitable-right-now defect in any lens — no
cross-account data access, no auth bypass, no webhook forgery, no missing index. The
core data path (IDOR/ownership, billing/webhook integrity, redirect safety, auth/token
handling) is **verified clean**. The Majors are: one real plan-cap concurrency race, one
missing-validation gap, three scalability cliffs that bite Pro accounts with real data
volumes, and three UI/UX correctness gaps (a promised behavior not delivered + two silent
error paths that read as data loss).

| Lens | 🔴 | 🟠 | 🟡 |
|---|---|---|---|
| Backend security | 0 | 2 | 6 |
| Scalability | 0 | 3 | 2 |
| UI/UX correctness | 0 | 3 | 1 |
| **Total** | **0** | **8** | **9** |

### Surface-by-surface verdict

| Surface | Verdict |
|---|---|
| IDOR / ownership | ✅ Verified clean (all handlers scope by `userId` at query level) |
| Plan-limit bypass | 🟠 S-1 (space-count race); server-side enforcement otherwise clean |
| Auth / token handling | ✅ Clean; 🟡 S-5, S-6 hardening |
| Billing / webhook integrity | ✅ Verified clean (prior B-6 `WebhookSecret` gap now FIXED) |
| Input validation | 🟠 S-2; 🟡 S-3, S-4 |
| Redirect safety | ✅ Verified clean |
| DB indexes | ✅ Verified clean (all FKs + hot columns covered) |
| N+1 / payload size | 🟠 SC-1, SC-2, SC-3; 🟡 SC-4, SC-5 |
| Paywall gates / photo gating | ✅ Verified clean (`reason` mapping sound) |
| Downgrade read-only / error feedback | 🟠 U-1, U-2, U-3; 🟡 U-4 |

---

## 🟠 Major findings

### Security

**S-1 — Free 2-space cap bypassable via concurrent-create race (TOCTOU)**
`CreateSpaceCommandHandler.cs:26-34`. Handler reads `CountByUserAsync(userId)` then, in a
separate non-locking round-trip, `AddAsync` — no DB-level count constraint. A Free user at
1 space firing N concurrent `POST /api/spaces` has each request read count = 1 (< 2) before
any insert commits → all N insert → account exceeds the paid cap. Zone/item caps unaffected
(gated on the whole submitted graph in one request). **Fix:** enforce count-check + insert
in one serializable transaction, or a DB-level per-user space-count constraint.
→ **Follow-up candidate** (genuine plan-limit bypass).

**S-2 — Space graph accepted without content-type / size / field validation**
`ItemDto.cs:14`, `TidansuDbContext.cs:104` (`Photo` uncapped `nvarchar(max)`),
`CreateSpaceCommandValidator.cs:12-14`, `UpdateSpaceCommandValidator.cs:13-15`. Validators
bind only `Space.Id/Name/Type`; `Zones`/`Items` collections + fields are unvalidated at the
app layer. Most strings 500 (via `DbUpdateException`) instead of a clean 400 when over the DB
cap; **`Item.Photo` has no cap or content-type check at any layer** — a Pro user can store
arbitrary large / non-image / `javascript:` / `data:text/html` data URLs verbatim, which the
SPA later renders as `img` sources. **Fix:** FluentValidation rules for the zone/item graph
(lengths matching DB `HasMaxLength`, tag bounds) + allow-listed image content-type and hard
per-photo byte cap; reject as 400. (Aggregate request-byte cap is scalability — see SC-3.)
→ **Follow-up candidate.**

### Scalability

**SC-1 — GetAccount loads the entire space graph (with photo blobs) just to count**
`GetAccountQueryHandler.cs:21` → `SpacesRepository.cs:10-16` → `UsageDto.cs:12-17`. Account
page `Include`s every zone + item (incl. `Item.Photo` data-URLs) only to compute 3 integers.
A Pro user with a few hundred photo items pulls multiple MB per account-page load for 3
numbers. **Fix:** projection/aggregate query (`CountAsync`/`GroupBy`) that never materializes
zones/items/photos; add a counts-only repo method. → **Follow-up candidate.**

**SC-2 — Whole-space PUT deletes + re-inserts all zones/items on every debounced edit**
`SpacesRepository.cs:37-49` (`ReplaceAsync`), driven by `UpdateSpaceCommandHandler.cs:41-45`
+ debounced save (`useSpacesStore.ts:70-81`). Renaming one item in a 50-item space issues
~100 DELETE + ~100 INSERT and rewrites every item's `Photo` blob instead of one UPDATE —
heavy write amplification + index churn under load. **Fix:** diff incoming vs existing and
apply per-entity add/update/remove (match on id), or granular item/zone endpoints. Design
change. → **Follow-up candidate.**

**SC-3 — Spaces list is unbounded and serializes photo data-URLs inline**
`GetSpacesQueryHandler.cs:15` → `SpacesRepository.cs:10-16`; `ItemDto.cs:14`. `GET /api/spaces`
returns every space/zone/item with each `Photo` base64 inline, no paging, eagerly loaded on
boot (`App.vue:27`). A heavy Pro account returns a tens-of-MB response, growing unbounded.
**Fix:** (a) don't ship photo blobs in the list — return a reference and fetch images
separately (ideally move photos to blob storage, not `nvarchar(max)`); (b) paging / per-space
lazy-load. Design change. → **Follow-up candidate.**

### UI/UX correctness

**U-1 — Downgrade does not make over-cap content read-only (contradicts the app's own promise)**
No read-only enforcement in `src/Tidansu.App` (only the *photo* lock exists). Promise at
`PricingView.vue:194` + CLAUDE.md product rule. Guards in `useLimits.ts:40-55` block only
*adding* past a cap. A Pro user with 5 spaces who drops to Free keeps all 3 over-cap spaces
fully editable — the opposite of what the FAQ tells them. **Fix:** derive a per-space
over-cap/read-only flag (spaces beyond `caps.spaces`, deterministic sort), disable mutating
affordances + badge "Read-only — upgrade to edit". (Server-side enforcement of the same is
tracked separately; this is the UI reflection.) → **Follow-up candidate.**

**U-2 — Initial spaces load has no loading/error state; a failed load reads as data loss**
`App.vue:27` (`void spaces.hydrate()` — fire-and-forget, no `.catch`); `useSpacesStore.ts:94-108`.
On boot, a failed fetch (offline / 500 / expired token) leaves `spaces = []` → `DashboardView`
shows "No spaces yet" to a user *with* data, and can trigger the starter-fridge seed as if a
new account. Even the happy path flashes the empty state until the fetch resolves. **Fix:**
expose TanStack Query `isLoading`/`isError`, render spinner + error/retry, gate the empty-state
seed on a *successful empty* response only, add `.catch` in `App.vue`. → **Follow-up candidate.**

**U-3 — Non-plan sync failures silently swallowed → optimistic edits lost with no feedback**
`useSpacesStore.ts:58-67` (`handleSyncError`). Optimistic create/update/delete persist via
`.catch(handleSyncError)`, which handles only the plan-limit 403; every other failure (network
/ 500 / 401) is `console.error`-only. The user sees the edit "succeed" locally, gets zero
feedback it never persisted, and loses it on reload (created spaces vanish, edits revert).
**Fix:** on non-plan errors surface a toast/banner and retry or roll back the optimistic change;
reuse the `billingMessage`-style transient-message pattern already in `useSessionStore`
(`setPlan` does this correctly — copy it). → **Follow-up candidate.**

---

## 🟡 Minor findings (hardening / nits)

**Security**
- **S-3** — Client-supplied primary keys (`Id` mass-assignment): `SpaceDto.cs:31,41-42`,
  `ItemDto.cs:37`, `ZoneDto.cs:45`. A colliding `Id` → PK violation → generic 500 (weak
  cross-tenant existence oracle; not an overwrite). Fix: server-generate ids or per-user
  uniqueness + clean 400.
- **S-4** — `Item.ZoneId` not validated to reference a zone in the same space (`ItemDto.cs:37`).
  Integrity nit, stays within the user's own space. Fix: validate `ZoneId` ∈ submitted zones.
- **S-5** — Fail-loud JWT-secret guard scoped to `IsProduction()` not `!IsDevelopment()`
  (`WebApplicationBuilderExtensions.cs:33`) — a mis-named `Staging` env skips it (mitigated:
  empty secret fails closed to 401; unset env defaults to Production). Fix: use `!IsDevelopment()`.
  **← candidate inline fix.**
- **S-6** — Access + refresh tokens in `localStorage` (`useAuthStore.ts:36`) — XSS could
  exfiltrate a 7-day refresh token; no reuse-detection family-revoke. Standard SPA tradeoff.
  Fix (hardening): httpOnly SameSite refresh cookie and/or reuse detection.
- **S-7** — Downgrade doesn't reset `user.SyncOn` (`StripeBillingService.cs:294-297`). Cosmetic
  today (no server-enforced sync path), but silent Pro-capability retention if sync becomes real.
  Fix: reset `SyncOn = false` on downgrade and/or gate on live plan. **← candidate inline fix.**
- **S-8** — ForwardedHeaders guard misses `PrefixLength == 0` ranges spelled differently / split
  full-coverage pairs (`Program.cs:67-86`) — IPv6 `::/0` gap from B-7 is FIXED. Fix: reject any
  parsed network with `PrefixLength == 0` rather than string-matching wildcards. **← candidate inline fix.**

**Scalability**
- **SC-4** — Read paths don't use `AsNoTracking` (`SpacesRepository.cs:10-24`).
  `GetAllByUserAsync` feeds read-only queries but tracks the whole graph. Fix: `.AsNoTracking()`
  on the read-only path (keep tracked variant for `UpdateSpace`). Borderline inline; fold into SC-1/SC-3.
- **SC-5** — Auth token tables never pruned (`RefreshTokensRepository`, `MagicLinkTokensRepository`).
  Consumed/expired rows never deleted → unbounded storage growth (queries stay index-backed).
  Fix: periodic cleanup job past a retention window.

**UI/UX**
- **U-4** — CreateSpace confirm step unguarded (`CreateSpaceView.vue:245-251`): reaching
  `/spaces/new` directly at the space cap lets onboarding complete, then server 403 reverts →
  create-then-vanish UX (no bypass; server enforces). Fix: guard `finish()` with
  `limits.guard(limits.checkAddSpace())`. **← candidate inline fix.**
- **U-5** — Sync toggle failure swallowed (`useSessionStore.ts:159`): toggle stays visually on
  though server never recorded it; self-corrects on reload. Fix: revert on error / show the
  `setPlan` transient message. **← candidate inline fix.**

---

## Verified clean (evidence)

- **IDOR / ownership** — every spaces read/mutate scoped by `userId` at the query level
  (`SpacesRepository.GetByIdAsync(id, userId)` filters `Id == id && UserId == userId`); all 5
  handlers resolve `userId` from the JWT `NameIdentifier` claim. Zones/items have no standalone
  controller — only reachable through the owning space. A foreign id → 404, never another tenant's data.
- **Billing / webhook integrity** — signature verified first (`EventUtility.ConstructEvent`,
  `StripeBillingService.cs:147`); raw-body read, no pre-buffering; account mapping via server-set
  `ClientReferenceId = user.Id` only; idempotency claim + plan mutation in one transaction. The
  B-6 `WebhookSecret`-in-`IsConfigured` gap is **now FIXED**. B-9 (rate-limit/body-cap) still carved off.
- **Auth / token handling** — magic-link + refresh tokens stored SHA256-hashed only; magic links
  single-use, burned before JWT issuance, 15-min TTL, supersede-on-resend; refresh rotation revokes
  the presented token; auth endpoints rate-limited; Identity lockout on; strict JWT validation
  (`ClockSkew = 0`); no committed prod secret.
- **Redirect safety** — `safeReturnUrl` rejects absolute + protocol-relative URLs, applied on both
  request and consume paths; backend only `Uri.EscapeDataString`s into the email link.
- **Injection** — no raw SQL anywhere; all data access parameterized EF LINQ; photos stored as
  strings (no path-traversal surface).
- **DB indexes** — all FKs + hot filter columns indexed (`Space.UserId`, `Zone.SpaceId`,
  `Item.SpaceId`, `RefreshToken.UserId` + unique `TokenHash`, `MagicLinkToken.Email` + unique
  `TokenHash`, `User.StripeCustomerId/StripeSubscriptionId`). `Item.ZoneId`/`Expiry` never filtered
  in SQL → no index needed.
- **Paywall / photo gating** — add-item/zone/space entry points pre-check the matching cap and open
  the paywall with the correct `reason` before mutating; photo affordance locked for non-Pro →
  `photos` paywall. `setPlan` reverts + surfaces `billingMessage` on error (the good pattern).

---

## Disposition — proposed follow-up backlog items

Critical/Major fixes are deferred to new backlog items (audit does not ship them). Proposed:

| Proposed id | Title | From |
|---|---|---|
| B-12 | Close the Free space-cap concurrency race (atomic count — serializable tx or DB constraint) | S-1 |
| B-13 | Validate the space zone/item graph + photo content-type/size (reject, don't store) | S-2 |
| B-14 | Account usage counts via projection, not full space-graph load | SC-1 |
| B-15 | Diff-based space update instead of delete-all/re-insert on every save | SC-2 |
| B-16 | Paginate/slim the spaces list; stop returning photo data-URLs inline (photo storage) | SC-3 |
| B-17 | Reflect read-only over-cap spaces after downgrade in the UI | U-1 |
| B-18 | Loading + error/retry states for spaces hydrate; don't show empty state on load failure | U-2 |
| B-19 | Surface (not swallow) non-plan space-sync failures; retry or roll back optimistic edits | U-3 |

**Already carved off (referenced, not re-filed):** [B-9] webhook rate-limit + body cap ·
[B-10] async Stripe payment methods · [B-11] NU1903 dependency bumps.

**Candidate inline fixes (Minor, ≤ ~30 LOC, no design judgement, no auth/billing *logic* change):**
S-5 (`!IsDevelopment()` guard scope), S-7 (reset `SyncOn` on downgrade), S-8 (`PrefixLength == 0`
reject), U-4 (guard `CreateSpaceView.finish()`), U-5 (revert sync-toggle on error). Minor security
items S-6 (token storage) and validation items S-3/S-4 are left as follow-ups (design judgement).
