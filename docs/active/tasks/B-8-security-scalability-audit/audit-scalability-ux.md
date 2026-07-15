# B-8 Audit — Scalability & UI/UX Correctness pass

**Date**: 2026-07-14
**Reviewer**: branch-code-reviewer agent (scalability + UI/UX lenses only)
**Mode**: whole-codebase (main clean/merged; diff vs origin/main is empty)
**Scope**: `src/Tidansu.Application`, `src/Tidansu.Infrastructure`, `src/Tidansu.App`
**Out of scope (owned by security-reviewer pass)**: IDOR/ownership, auth/token,
plan-limit *bypass*, webhook integrity, input validation, redirect safety.
Already carved off: [[B-9]] webhook rate-limit/body cap, [[B-10]] async Stripe
payment methods, [[B-11]] NU1903 bumps — not re-filed here.

## Summary count

- 🔴 Critical: **0**
- 🟠 Major: **6** (3 scalability, 3 UI/UX)
- 🟡 Minor: **3** (2 scalability, 1 UI/UX)

No exploitable-right-now defects in these two lenses. The Majors are realistic
scalability cliffs for Pro users with real data volumes, plus three UI/UX
correctness gaps (a promised behavior not delivered, and two silent/absent
error paths that read as data loss).

---

## Scalability

### 🟠 S1 — GetAccount loads the entire space graph (with photo blobs) just to count
**Location**: `src/Tidansu.Application/Account/Queries/GetAccount/GetAccountQueryHandler.cs:21`
→ `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs:10-16` (`GetAllByUserAsync`)
→ `src/Tidansu.Application/Account/Dtos/UsageDto.cs:12-17`

**Scenario**: The account page calls `GetAllByUserAsync`, which `Include`s every
zone and every item (including `Item.Photo`, an `nvarchar(max)` that holds full
data-URL images — see `TidansuDbContext.cs:104`). `UsageDto.From` then uses the
materialized graph only to compute three integers (`Spaces`, `Items.Count`,
`Max items`). A Pro user with a few hundred photo-bearing items pulls multiple MB
across the wire and into memory on every account-page load, to produce 3 numbers.

**Fix**: Replace with a projection/aggregate query — e.g. a grouped
`Spaces.Where(s => s.UserId == userId).Select(s => new { s.Id, Items = s.Items.Count })`
(or two `CountAsync`/`GroupBy` calls) that never materializes zones, items, or
photo blobs. Add a repository method that returns counts, not entities.

**Follow-up backlog candidate**: yes — *"Account usage counts via projection, not
full space-graph load"*.

### 🟠 S2 — Whole-space PUT deletes and re-inserts all zones + items on every debounced edit
**Location**: `src/Tidansu.Infrastructure/Repositories/SpacesRepository.cs:37-49`
(`ReplaceAsync`), driven by `UpdateSpaceCommandHandler.cs:41-45` and the frontend
debounced save (`useSpacesStore.ts:70-81`).

**Scenario**: The client debounces edits into a whole-space `PUT`. `ReplaceAsync`
does `RemoveRange(existing.Items)` + `RemoveRange(existing.Zones)`, saves, then
re-inserts the full new set. Renaming a single item in a 50-item space issues
~100 DELETE + ~100 INSERT statements and rewrites every item's `Photo` blob,
rather than a single-row UPDATE. Under load (many users, large spaces) this is
heavy write amplification and index churn on `Item`/`Zone`.

**Fix**: Diff the incoming set against `existing` and apply add/update/remove per
entity (match on id), or move to granular item/zone endpoints. At minimum, skip
untouched rows so an edit to one item is one UPDATE. This is a design change, not
a trivial inline fix.

**Follow-up backlog candidate**: yes — *"Diff-based space update instead of
delete-all/re-insert on every save"*.

### 🟠 S3 — Spaces list is unbounded and serializes photo data-URLs inline
**Location**: `src/Tidansu.Application/Spaces/Queries/GetSpaces/GetSpacesQueryHandler.cs:15`
→ `SpacesRepository.cs:10-16`; DTO `SpaceDto.cs`/`ItemDto.cs:14` (`Photo` returned whole).

**Scenario**: `GET /api/spaces` returns *every* space with *every* zone and item,
no paging/limit, with each item's `Photo` (a base64 data URL) inline. Free plan
is capped (2 spaces / 50 items), but Pro is unlimited — a heavy Pro account
returns a single response of tens of MB, all eagerly loaded on app boot
(`App.vue:27` → `useSpacesStore.hydrate`). Grows unbounded with the account.

**Fix**: Two-track — (a) don't ship photo blobs in the list payload; return a
photo reference/URL and fetch the image separately (ideally move photos to blob
storage rather than `nvarchar(max)`); (b) introduce paging or a per-space
lazy-load so the client isn't forced to hold the whole account in memory. Design
change; defer.

**Follow-up backlog candidate**: yes — *"Paginate/slim the spaces list; stop
returning photo data-URLs inline"*. (Overlaps the photo-storage question; keep
separate from [[B-10]].)

### 🟡 S4 — Read paths don't use `AsNoTracking`
**Location**: `SpacesRepository.cs:10-24` (`GetAllByUserAsync`, `GetByIdAsync`).

**Scenario**: Both read methods track every returned entity. `GetByIdAsync` needs
tracking for the `UpdateSpace` mutate path, but `GetAllByUserAsync` feeds only
read-only queries (`GetSpaces`, `GetAccount`) and still builds change-tracker
entries for the entire graph (zones + items + photo strings) — wasted CPU/memory
per request that scales with data volume.

**Fix**: Add `.AsNoTracking()` to `GetAllByUserAsync` (and to a read-only variant
of `GetByIdAsync` used by `GetSpace`, keeping a tracked variant for
`UpdateSpace`). Small, but touches the read/write split — borderline for inline.

**Follow-up backlog candidate**: optional (fold into S1/S3 work).

### 🟡 S5 — Auth token tables are never pruned
**Location**: `src/Tidansu.Infrastructure/Repositories/RefreshTokensRepository.cs`,
`MagicLinkTokensRepository.cs` — add/read only; no delete of expired/consumed rows.

**Scenario**: Every magic-link request and every refresh writes a row; consumed
and expired rows are never removed. `RefreshTokens`/`MagicLinkTokens` grow
unbounded over the app's lifetime. Lookups are index-backed (unique `TokenHash`),
so query cost stays flat, but table/storage growth is unbounded.

**Fix**: A periodic cleanup (background service or scheduled job) deleting
`ExpiresAt < now` / consumed rows past a retention window. Operational, low
urgency.

**Follow-up backlog candidate**: optional — *"Prune expired magic-link / refresh
tokens"*.

### Indexes — verified clean (no finding)
Inspected `TidansuDbContext.OnModelCreating` and the model snapshot. All FKs and
hot filter columns are indexed: `Space.UserId` (72), `Zone.SpaceId` and
`Item.SpaceId` (auto FK indexes, snapshot 214/509), `RefreshToken.UserId` +
unique `TokenHash`, `MagicLinkToken.Email` + unique `TokenHash`,
`User.StripeCustomerId`/`StripeSubscriptionId`. `Item.ZoneId` has no index but is
never used as a DB filter (zone grouping is in-memory client-side), and `Expiry`
is a client-computed string never filtered in SQL — so neither warrants an index.
No missing-index finding.

---

## UI/UX correctness

### 🟠 U1 — Downgrade does not make over-cap content read-only (contradicts the UI's own promise)
**Location**: no enforcement anywhere in `src/Tidansu.App` (grep for
read-only/locked finds only the *photo* lock). Promise stated at
`src/Tidansu.App/src/views/PricingView.vue:194` ("Spaces and items beyond the Free
limits become read-only…"); product rule in CLAUDE.md ("Downgrade keeps data but
makes over-cap content read-only"). Guards `useLimits.ts:40-55` only block *adding*
past a cap.

**Scenario**: A Pro user with 5 spaces switches to Free. `checkAddSpace` only
blocks creating a *new* space; `checkAddItem`/`checkAddZone` only block growth
*within* a space. The 3 over-cap spaces remain fully openable and editable —
rename, add/edit/remove items (up to 50), add zones — despite the FAQ and product
spec promising they become read-only. The UI delivers the opposite of what it
tells the user.

**Fix**: Derive an over-cap/read-only flag per space (spaces beyond
`caps.spaces`, sorted deterministically) and disable mutating affordances +
badge them "Read-only — upgrade to edit". (Server-side enforcement of the same is
the security reviewer's plan-limit call; this finding is the UI reflection only.)

**Follow-up backlog candidate**: yes — *"Reflect read-only over-cap spaces after
downgrade in the UI"*.

### 🟠 U2 — Initial spaces load has no loading or error state; a failed load reads as data loss
**Location**: `src/Tidansu.App/src/App.vue:27` (`void spaces.hydrate()` — fire and
forget, no `.catch`); `useSpacesStore.ts:94-108` (`hydrate`).

**Scenario**: On boot/reload, `hydrate()` fetches the list with no error handling.
If the request fails (offline, 500, expired token mid-flight), the promise
rejects unhandled, `spaces.value` stays `[]`, and `DashboardView` renders its
"No spaces yet" empty state (`DashboardView.vue:56-66`) — telling a user with
data that they have none. There is also no loading state, so even the happy path
flashes "No spaces yet" until the fetch resolves. Worst case: the empty-state
seed logic (`hydrate` line 103-107) can then create a starter fridge as if it
were a brand-new account.

**Fix**: Track `isLoading`/`isError` (TanStack Query is already the fetch layer —
expose its states) and render a spinner during load and an error+retry panel on
failure, gating the empty-state/seed on a *successful* empty response only. Add a
`.catch` in `App.vue`.

**Follow-up backlog candidate**: yes — *"Loading + error/retry states for spaces
hydrate; don't show empty state on load failure"*.

### 🟠 U3 — Sync failures (non-plan) are silently swallowed → optimistic edits lost with no feedback
**Location**: `src/Tidansu.App/src/stores/useSpacesStore.ts:58-67` (`handleSyncError`).

**Scenario**: Create/update/delete mutate the store optimistically, then persist
via `api.*(...).catch(handleSyncError)`. `handleSyncError` only handles the
plan-limit 403 (opens paywall + re-syncs); every other failure (network drop,
500, 401) hits the `else` branch and is `console.error`-only. The user sees the
edit "succeed" locally, gets zero feedback that it never persisted, and loses it
on the next reload (created spaces vanish; edits revert). Silent data loss.

**Fix**: On non-plan errors, surface a user-visible toast/banner ("Couldn't save —
retrying / check your connection") and either retry or roll back the optimistic
change so local state matches the server. Reuse the `billingMessage`-style
transient-message pattern already in `useSessionStore`.

**Follow-up backlog candidate**: yes — *"Surface (not swallow) non-plan space-sync
failures; retry or roll back optimistic edits"*.

### 🟡 U4 — CreateSpace flow is unguarded at the confirm step (server backstops)
**Location**: `src/Tidansu.App/src/views/CreateSpaceView.vue:245-251` (`finish` calls
`store.addSpace` with no `checkAddSpace` guard).

**Scenario**: `DashboardView.goCreate` guards `checkAddSpace` before routing here,
but `finish()` itself doesn't. A user who reaches `/spaces/new` directly (URL /
back-forward) while at the space cap can complete onboarding; the space is created
optimistically and they're routed into it, then the server 403 → `handleSyncError`
opens the paywall and reverts, so the space vanishes under them. No cap *bypass*
(server enforces — that's the security reviewer's domain), but a jarring
create-then-vanish UX.

**Fix**: Guard `finish()` with `limits.guard(limits.checkAddSpace())` before
`addSpace`, matching the dashboard entry point.

**Follow-up backlog candidate**: optional (small, but a design-consistent guard;
could be inline-fixed per §4 if the orchestrator opts in).

### 🟡 U5 — Sync toggle failure is swallowed
**Location**: `src/Tidansu.App/src/stores/useSessionStore.ts:159` (`setSync` →
`.catch((e) => console.error(...))`).

**Scenario**: Toggling "Sync across devices" flips optimistically and persists; on
failure it's console-only. The toggle stays visually on while the server never
recorded it — minor inconsistency, self-corrects on reload, no data loss.

**Fix**: Revert the optimistic flip on error and/or show the same transient
message pattern used by `setPlan`.

**Follow-up backlog candidate**: optional.

### UI/UX surfaces verified clean
- Add-item / add-zone / add-space *entry points* correctly pre-check the matching
  cap and open the paywall with the right `reason` before mutating
  (`SpaceView.vue:160-260`, `DashboardView.vue:161-181`) — the guard/`reason`
  wiring in `useLimits.ts` is sound (spaces/zones/items/photos/sync all mapped).
- Photo gating is correct: `ItemDetailModal` locks the photo affordance for
  non-Pro (`canPhoto = session.isPro`) and emits `photoLocked` →
  `SpaceView.onPhotoLocked` opens the `photos` paywall.
- `setPlan` (upgrade/downgrade) handles the three billing response shapes and, on
  error, reverts + surfaces `billingMessage` rather than swallowing
  (`useSessionStore.ts:124-154`) — good pattern; U3/U5 should copy it.
</content>
</invoke>
