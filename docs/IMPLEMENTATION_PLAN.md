# Tidansu — Implementation Plan

Resumable, multi-session build plan for **Tidansu**, a spatial inventory app
recreated from `design_handoff_storebook/` on the **SelfGrind** stack
(.NET 10 Clean Architecture + CQRS backend; Vue 3 + Pinia + TanStack Query +
Kiota + PrimeVue-unstyled + Tailwind v4 frontend).

## Status

Phase 14 **complete** — and with it **all 14 phases are done**. Plan change now
routes through an `IBillingService` seam: the default `DirectBillingService` flips
the plan immediately (the shipped "flag-now" behaviour), while a config-gated
`StripeBillingService` (Stripe.net) creates a Checkout session on upgrade and
applies Pro from a `POST /api/billing/webhook` event — off by default, built but
not key-tested. `ChangePlan` returns `{ account, checkoutUrl? }`; the frontend
`setPlan` redirects to checkout when a URL comes back (none in direct mode).
**Verified** (direct mode): plan→pro returns `checkoutUrl:null` and persists,
plan→free works, webhook endpoint returns 200. `dotnet build` + `npm run build`
green. **The build is finished** — full-stack Tidansu (landing/auth/spaces/onboarding/
layout-editor/plans-paywall/pricing/account) on .NET 10 + Vue 3 with real magic-link
auth, server-persisted spaces/zones/items + plan limits, and a Stripe-ready billing
seam.

Phase 13 **complete** — spaces/zones/items persistence + account endpoints +
frontend swapped to the live API. Item 3: Kiota regenerated (spaces + account
endpoints; `fix-generated.mjs` now also fixes Kiota's `getCollectionOfPrimitiveValues`
arity); `api/spaceMapping.ts` (DTO↔`Space`), `useSpacesApi`/`useAccountApi`,
shared `queryClient`. `useSpacesStore` rewritten **API-backed** (hydrate from
`GET /api/spaces` via `fetchQuery`; optimistic mutate + persist: immediate
POST/DELETE, debounced whole-space PUT; seeds the starter fridge server-side when
empty; `reset()` on sign-out) with **identical action signatures/getters** so views
are untouched; `useSessionStore` plan/sync persist to `/api/account`; `useAuth`
hydrates on sign-in + resets on sign-out; `App.vue` re-hydrates on reload; server
403 `{plan:[reason]}` opens the paywall + re-syncs. **Browser-verified** the
decisive case: add an item → wipe **all** localStorage → re-login → the item
reappears (server-sourced; `hasSpacesCache:false`), sign-out clears tokens, zero
console errors. `dotnet build` + `npm run build` green. **Next:** Phase 14 —
Stripe-ready billing (deferred).

Phase 13 **in progress** — item 1 **complete**: spaces/zones/items persistence.
Domain `Space`/`Zone`/`Item` (ids = client uids; union fields stored as lowercase
strings; `Zone.Rect*` as nullable doubles; `ColumnLabels`/`Tags` as JSON primitive
collections), `Domain/Constants/PlanLimits` + `PlanLimitException`, `ISpacesRepository`
(+ `ReplaceAsync` delete-then-insert graph swap). Application `Spaces` feature —
`SpaceDto`/`ZoneDto`/`ItemDto`/`RectDto` (static From/ToEntity), `GetSpaces`/`GetSpace`
queries, `CreateSpace`/`UpdateSpace`/`DeleteSpace` commands (+ validators).
**Server-side limits**: create checks space-count + zones/items/photos caps; update
applies the downgrade rule (reject a mutation that pushes a capped dimension
*higher* once at/over cap; over-cap content stays editable). `SpacesController`
(`GET`/`GET{id}`/`POST`/`PUT{id}`/`DELETE{id}`, `[Authorize]`); `PlanLimitException`
→ 403 `{plan:[reason]}`. Migration `SpacesZonesItems` applied. **Verified** via API
with a real JWT: create persists the graph, 3rd space→403 `spaces`, update→7 zones
→403 `zones`, add photo on Free→403 `photos`, legit replace-graph update→200,
delete→204, no-token→401. `dotnet build` green. **Next:** Phase 13, item 2 —
account/usage + plan-change (pro/free) + sync endpoints.

Phase 12 **complete** — real magic-link auth, front to back. Item 1: `User`
carries `DisplayName`/`Plan` enum/`SyncOn`; `MagicLinkToken` entity + repo;
migration `UserPlanAndMagicLinkTokens` applied. Item 2: Application `Auth` feature
(`RequestMagicLink`/`ConsumeMagicLink`/`RefreshToken` + validators +
`AuthResponse`/`AuthUserDto`), Domain `IUserService`/`IMagicLinkEmailSender`,
Infrastructure `UserService` + `MagicLinkEmailSender`, anonymous `AuthController`
(`POST /api/auth/{magic-link,consume,refresh}`, magic-link+consume rate-limited),
verified end-to-end. Item 3: Kiota regenerated (typed `[ProducesResponseType<T>]`
so responses aren't `ArrayBuffer`); frontend `useAuthStore` (JWT persistence),
`useApiClient` (Kiota + Bearer provider, same-origin base URL), `useAuth`
(requestMagicLink/consume/refresh/signOut); `useSessionStore.signIn`→`setUser`
(server-fed user); `LoginView` drives the real flow incl. the `?token=…` callback;
`AccountView` sign-out clears tokens. **Browser-verified** (Chromium, both servers
up): full sign-in stores access+refresh + server-derived "Verify User", honours
`returnUrl=/account`, seeds "My fridge", persists across reload, sign-out clears
all; zero console errors. `dotnet build` + `npm run build` green. **Next:**
Phase 13, item 1 — `Space`/`Zone`/`Item` domain + repos + CQRS CRUD with
server-side limit enforcement.

Phase 11 **complete** — backend foundation: the .NET solution now has a working
Clean-Architecture backbone. **Domain** (`User : IdentityUser`, `RefreshToken`,
`IJwtService`/`IEmailService`, four domain exceptions, `IRefreshTokensRepository`);
**Application** (`AddApplication` wiring MediatR + `ValidationBehavior` +
AutoMapper + FluentValidation + `IUserContext`); **Infrastructure**
(`TidansuDbContext : IdentityDbContext<User>`, `AddInfrastructure` with SqlServer
DbContext + Identity stores + JWT + FluentEmail, `JwtService`/`JwtSettings`,
file-based `EmailService`, `RefreshTokensRepository`); **API** (`Program.cs`
pipeline, `AddPresentation` with JWT auth + CORS + Swagger + rate-limiter +
compression + Serilog, `ErrorHandlingMiddleware`, `ApiOperationResult`,
`StringExtensions`). Kiota `build:api` scripts + `fix-openapi.mjs`/`fix-generated.mjs`
ported. `InitialCreate` migration created **and applied** to localdb. `dotnet build`
green (0 errors; 10 inherited NU1903 warnings); API boots → `/swagger/v1/swagger.json`
200 + SPA `/` 200. **Next:** Phase 12, item 1 → real magic-link auth (`User`
+Plan/SyncOn, `MagicLinkToken` entity + repo).

**Verification tooling:** Playwright Chrome (channel) needs admin, but bundled
**Chromium** is installed and `playwright` is available via `npm i --no-save
playwright`. The MCP browser tools still fail (hard-wired to the `chrome`
channel) — instead drive headless Chromium with a local `src/Tidansu.App/
verify*.mjs` script (gitignored) against `npm run dev`, then Read the PNGs in
`C:/tmp/tidansu-shots`.

## Conventions

- **Stack:** .NET 10 Clean Architecture + CQRS (MediatR, FluentValidation,
  AutoMapper, EF Core `IdentityDbContext<User>`, JWT + refresh, FluentEmail→file
  in dev) backend; Vue 3 Composition API (Pinia, TanStack Query, Vue Router,
  Kiota client, PrimeVue `unstyled:true` + Tailwind CSS v4, vee-validate + zod)
  frontend.
- **Repo layout:** `Tidansu.sln`, `src/Tidansu.{Domain,Application,Infrastructure,API}`,
  `src/Tidansu.App` (Vue). `docs/` holds this plan. `global.json` pins the SDK.
  Frontend builds to `Tidansu.API/wwwroot`; Vite proxies `/api` to the backend.
- **Frontend folders:** `views/`, `components/base|landing|spaces|space|pricing|account|paywall/`,
  `composables/`, `stores/`, `router/`, `schemas/`, `data/` (typed ports of the
  prototype's `data.jsx`), `api/`.
- **Naming:** views `{Feature}View.vue`; base comps `Base{Name}.vue`; feature
  comps `{Feature}{Name}.vue`; backend `{Verb}{Feature}Command/Query/Handler/Validator`,
  `I{Feature}Repository`, `{Feature}Profile`.
- **State:** Pinia stores mirror the prototype store shape (`session`, `spaces`);
  TanStack Query for server data once the backend exists; auth JWT in
  `useAuthStore`.
- **Styling:** **all** colors are `@theme` tokens in `style.css` (storebook
  OKLCH); variant-prop pattern, static Tailwind classes only, no hardcoded hex,
  `twMerge` for external classes, computed for all derived display values, named
  handlers only.
- **Template purity (HARD RULE):** no logic in `<template>` — no ternaries/`!!`/
  `??`/arithmetic/concat/method-calls/lookups for values or classes, no inline
  assignments or `emit(...)`. Use `computed` + named handlers; for `v-for` build a
  fully-mapped computed array. Spec in `CLAUDE.md` + `.claude/context/frontend-rules.md`.
- **Locked product config (ship, never expose):** Cards dashboard · Airy
  `--pad:1.18` · Soft `--r-card:16px`/`--r-ctrl:11px` · Smart add · "see as
  layout" on. **No Tweaks panel, no `forcePlan`.**
- **Limit enforcement** is checked *before every mutate*; on cap → open the
  paywall with the matching `reason`, never mutate.

## Phases

### Phase 1 — Scaffold + design tokens
- [x] Create `Tidansu.sln` + `src/Tidansu.{Domain,Application,Infrastructure,API}`
  skeleton mirroring SelfGrind (net10.0, ImplicitUsings, project refs,
  `global.json`); minimal API `Program.cs` (SPA fallback). **Cross-cutting
  (ErrorHandling/Behaviors/Common/etc.) deferred to Phase 11** — it needs domain
  types and is only exercised once the backend is built. _(ref: SelfGrind `src/*`, CLAUDE.md)_
- [x] Scaffold `src/Tidansu.App` from SelfGrind config (package.json renamed,
  vite `outDir → Tidansu.API/wwwroot`, tsconfig, .prettierrc, .env); `npm install`. _(ref: SelfGrind.App)_
- [x] `index.html`: load **Hanken Grotesk** from Google Fonts; title/meta for Tidansu. _(ref: handoff Assets)_
- [x] Port reusable infra: `useModal`, `useColorVariant` (rebuilt for the zone/
  status palette). **API-coupled infra deferred to Phases 11–12** —
  `useApiClient`, `useApi`, `tokenRefresh`, `BearerAuthenticationProvider`,
  `useAuthStore`, `useForm`/`useFormErrors` all import the not-yet-generated Kiota
  client, so they'd break the type-check now. _(ref: SelfGrind composables/stores/api)_
- [x] Rewrite `src/style.css` `@theme` with storebook **OKLCH** tokens: surfaces
  (bg/surface 1-3), hairlines, text 1-3, primary action, zone palette
  (blue/green/amber/pink/gray, Pro=amber), status (warn/danger/ok), geometry
  (`--radius-card:16`/`--radius-ctrl:11`/`--radius-chip:999`, `--radius-xl2:20`),
  `--pad:1.18`, Hanken Grotesk, global `letter-spacing:-0.01em`. _(ref: handoff Design Tokens, styles.css)_
- [x] Port + retheme base primitives: `BaseButton`, `BaseModal`, `BaseBadge`(pill),
  `BaseIcon`, `BaseProgressBar`(meter), `BasePopoverMenu`+`BasePopoverMenuItem`(⋯),
  `BaseEmptyState`, `BaseText`, `BaseCard`. (`BaseForm` deferred with the form
  composables.) _(ref: styles.css component classes)_
- [x] Build the line-icon set into `components/icons.ts` + `BaseIcon` (full
  storebook set incl. `itemIcon()` keyword mapping). _(ref: icons.jsx)_
- [x] Copy `.claude/` context+skills+templates and write Tidansu `CLAUDE.md`
  (SelfGrind→Tidansu renamed; selfgrind-specific `settings.local.json` dropped). _(ref: SelfGrind .claude)_

### Phase 2 — Routing + app shell + in-app nav
- [x] `router/index.ts` (`AppViews`, `createRoute`, `LayoutType` APP/PLAIN, auth
  guard + `returnUrl` + `VITE_DISABLE_AUTH`, `RouteMeta` augmentation, doc titles);
  routes `/ /login /spaces /spaces/new /spaces/:id /pricing /account`. Placeholder
  views created for all 7 routes (filled in their respective phases). _(ref: handoff App phases/routes)_
- [x] Layout components: `AppLayout` (in-app, with `AppNav`) + `PlainLayout` (bare,
  for landing/auth/create/space which bring their own chrome); `App.vue` switches
  on `layoutType` meta; page gutters via `--gutter`. _(ref: per-screen max-widths)_
- [x] `AppNav`: brand→/spaces, Spaces/Pricing links, plan pill + account avatar
  (when signed in) / Sign-in button (when not). _(ref: handoff In-app nav)_
- [x] `App.vue` (layout switch + `RouterView`) + `main.ts` (Pinia, VueQuery,
  PrimeVue unstyled, **router**). _(ref: SelfGrind main.ts)_

### Phase 3 — Auth (magic link, mocked frontend) + session state
- [x] `useSessionStore` (Pinia): `user {name,email,plan}`, derived `plan`/`isPro`/
  `caps` (from `PLANS`/`planOf`/`isInf`), `syncOn`, `signIn`/`signOut`/`setPlan`/
  `setSync`, localStorage persistence. _(ref: handoff State, data.jsx PLANS)_
- [x] `LoginView` state A: brand, H1, email input, "Send magic link" (disabled
  until `^[^@\s]+@[^@\s]+\.[^@\s]+$`), fine print. _(ref: 02-auth-email.png)_
- [x] `LoginView` state B: green check badge, "Check your inbox", demo "Open the
  link"→`signIn` (name from local-part, default `free`), "Use a different
  email"/"Resend". _(ref: 03-auth-sent.png)_
- [x] On auth success: `seedStarterIfEmpty()` (first login) → `returnUrl` or
  `/spaces`; `signOut` action present (button wired in Phase 9 Account). _(ref: handoff auth success)_
- [x] **Data foundation pulled forward** (needed for seeding): `data/types.ts`,
  `data/plans.ts` (PLANS/isInf/planOf), `data/spaces.ts` (SPACE_TYPES,
  ZONE_TEMPLATES, buildZones, zoneName, applyComplexity, layout geometry, uid),
  `data/seed.ts` (seedFridge + dates), `useSpacesStore` (state + persistence +
  `seedStarterIfEmpty`). Phases 4/5/6 consume these. _(ref: data.jsx)_

### Phase 4 — Spaces dashboard + space CRUD
- [x] `useSpacesStore` CRUD: `addSpace`, `renameSpace`, `duplicateSpace` (fresh
  ids on space/zones/items + remapped `zoneId`, "{name} copy", inserted after
  original), `deleteSpace`. _(ref: data.jsx, app.jsx loadState)_
- [x] `DashboardView`: header (H1 "Your spaces", "{n} spaces · {name}",
  `UsageMeter`, New-space btn) + **2-col card grid** + dashed New-space tile. _(ref: 04-dashboard.png)_
- [x] `SpaceCard`: type icon, name, type label, ⋯ menu (Rename/Duplicate/Delete),
  mini preview (≤6 zone bands), footer item/zone counts + "Open →" (whole card
  opens; menu region `@click.stop`). _(ref: screens-dashboard.jsx)_
- [x] CRUD modals: `SpaceRenameModal` (prefilled, autofocus+select),
  `SpaceDeleteModal` (danger confirm copy); Duplicate is a direct action. _(ref: handoff CRUD modals)_
- [x] Empty state (`BaseEmptyState` cabinet icon, "No spaces yet", "Create a space"). _(ref: handoff empty state)_
- _Note: at-limit upsell banner + locked New-space tile + paywall on create/
  duplicate are wired in Phase 7 (handlers `goCreate`/`onDuplicate` already
  centralized for interception)._

### Phase 5 — Create-space onboarding
- [x] Port `SPACE_TYPES`, `ZONE_TEMPLATES`, `buildZones`, `applyComplexity` to
  typed `data/spaces.ts` (done Phase 3) + `data/onboarding.ts` (`COMPLEXITY`,
  `DEFAULT_NAME`, `seedForType`). _(ref: data.jsx, screens-onboarding.jsx)_
- [x] `CreateSpaceView` 3-step (type → complexity → confirm) with
  `OnboardingStepBar` + `ComplexityViz`, "Back to spaces" on step 1; on finish
  `seedForType` → `addSpace` → open the space. _(ref: screens-onboarding.jsx)_

### Phase 6 — Space views (list / layout / editor)
- [x] Port helpers: `parseAdd`/`matchZone` (`data/items.ts`), expiry helpers
  (`data/dates.ts` — `seed.ts` refactored to reuse it), `zoneName` + layout
  geometry already in `data/spaces.ts`. _(ref: data.jsx)_
- [x] Space chrome (`SpaceHeader`): back-to-spaces, name+counts, avatar, list/
  layout toggle; "see as layout" promo (`SeeAsLayoutPromo`, locked on) for
  non-list types. _(ref: handoff §5)_
- [x] List view + **Smart add** (`SmartAdd` → `parseAdd` → store `addItemSmart`),
  `ItemList` (search + List/By-zone accordion), `ItemRow` + `ItemExpiry` chips. _(ref: screens-list.jsx)_
- [x] `ItemDetailModal` with photo slot (Free → Pro lock → emits `photoLocked`;
  paywall wired in Phase 7). _(ref: handoff item detail)_
- [x] Layout view (spatial zones) + Layout editor (add/draw zone). _(ported
  `screens-layout.jsx` + `screens-editor.jsx`: `LayoutView` Shelves/Top toggle,
  `ShelfElevation`/`ShelfUnit`/`MapZone`/`ItemChip`/`AddChip`, `LayoutTop`
  (columns + freeform map); `LayoutEditor` with `ColumnsEdit`, `FreeCanvas`
  (pointer draw/move/resize/snap), `ZoneProps`; `AddItemModal` for in-layout
  adds; store `addZoneColumn`/`addZoneFree`/`updateZone`/`deleteZone`/
  `convertToFreeform`)_

### Phase 7 — Plans + limit-enforcement + paywall
- [x] `useLimits` composable: pre-mutate checks for spaces≥2 / zones≥6 / items≥50 /
  photos / sync → returns paywall `reason`. _(`checkAddSpace`/`checkAddZone`/
  `checkAddItem`/`checkPhoto`/`checkSync` return the blocking reason or null;
  `guard(reason)` opens the paywall + returns false; shared module-level
  `paywallReason` ref + `openPaywall`/`closePaywall`.)_
- [x] Wire enforcement into create/duplicate space (`spaces`), editor add-zone
  (`zones`), smart-add (`items`), photo (`photos`), sync toggle (`sync`). _(create/
  duplicate in `DashboardView`; add-zone (columns + freeform) and smart/in-layout
  add in `SpaceView`; photo via `onPhotoLocked`. **Sync** firing point waits on the
  Phase 9 Account toggle — `checkSync` is ready.)_
- [x] `PaywallModal` keyed by `reason∈{spaces,zones,items,photos,sync}` with
  `PAYWALL` copy, Pro badge, benefits checklist, "See Pro plans"→/pricing, "Not
  now", fine print. _(copy in `data/paywall.ts`; mounted once in `App.vue` so it
  covers PLAIN-layout routes like SpaceView too.)_
- [x] Dashboard at-limit: amber upsell banner + locked New-space tile. _(banner with
  Upgrade→/pricing; New-space tile shows lock + "Upgrade for more spaces" / "You've
  used all N on Free" when at the cap.)_

### Phase 8 — Pricing
- [x] `PricingView`: hero (eyebrow Plans, H1), monthly/yearly toggle (−20%), two
  plan cards (Free / Pro amber + badge; `$5/mo` or `$4/mo billed $48/yr`), feature
  rows from `PLAN_FEATURES`. _(added `PLAN_FEATURES`/`PlanFeature`/`PlanFeatureKey`
  to `data/plans.ts`; `components/pricing/PlanCard.vue` (price/sub/save badge,
  check/x feature rows, current/free/pro CTA).)_
- [x] Comparison table (6 features × Free/Pro, Pro tinted) + FAQ (downgrade keeps
  data read-only, cancel anytime). _(mapped `comparison` computed; 2-question FAQ.)_
- [x] Upgrade→`pro` / downgrade→`free`, return to origin route. _(`session.setPlan`
  + `returnToOrigin` (router.back with /spaces fallback); guests bounce to login
  with `returnUrl=/pricing`.)_

### Phase 9 — Account / settings
- [x] `AccountView`: Profile card (initial avatar, name, email, plan pill). _(`Back
  to spaces` link; initial from name/email; `BaseBadge` plan pill, pro=amber+sparkle.)_
- [x] Plan card (Free→Upgrade CTA; Pro→Manage billing / Switch to Free). _(`planLead`
  computed; Upgrade/Manage→/pricing, Switch to Free→`setPlan('free')`.)_
- [x] Usage meters: Spaces, Items across all spaces, Fullest space; warn color at cap.
  _(reuses `UsageMeter`; `itemsCap` = items×max(1,count) (Infinity on Pro); per-space
  hint shown on Free.)_
- [x] Sync toggle row (Pro-gated → paywall `sync`) + Sign out. _(`onToggleSync` →
  `guard(checkSync())`: Free opens the **sync** paywall, Pro flips `setSync`; closes
  the deferred Phase 7 sync firing point. Sign out → `signOut` + /login.)_

### Phase 10 — Landing + polish + responsive
- [x] `LandingView`: hero 2-col (`1.05fr 0.95fr`), faux space-card illustration,
  "How it works" band (3 steps), Features (3 cards), Pricing teaser, Final CTA,
  footer. _(own nav/footer with Tidansu wordmark; hero art = mapped `heroShelves`
  with zone-accent strips + item chips; `steps`/`features`/teaser as mapped arrays.)_
- [x] Container-query responsive (~720/560px): grids→1 col, nav links hide, plan
  cards stack. _(implemented with the codebase's Tailwind breakpoint utilities —
  `sm:`/`lg:` — for consistency: nav links `hidden sm:flex` (CTA `max-sm:ml-auto`),
  hero `lg:grid-cols-[1.05fr_0.95fr]`, bands `sm:grid-cols-3` / teaser `lg:grid-cols-2`.)_
- [x] Visual QA vs all 8 screenshots; flat hairline borders, no gradients/shadows
  except menu/modal elevation; a11y (focus, tap targets, contrast). _(each screen
  verified against its reference across phases; grep confirms no `shadow-`/`gradient`
  outside `elev-modal`/`elev-menu`; added `focus-within:border-border-strong` to the
  two transparent inputs (SmartAdd, ItemList search) — all other inputs already cue
  focus via `border-border-strong`; icon-only buttons carry `aria-label`/`title`.)_

### Phase 10.1 — UX refinements (post-frontend polish)
User-reported fixes after walking the built frontend. _(ref: user feedback 2026-06-19.)_
- [x] **Modal backdrop close:** moved the close handler onto the dim overlay div in
  `BaseModal` (the `@click.self` on the outer wrapper never fired — the absolute
  overlay intercepted clicks); added an explicit ✕ + Edit/Remove buttons to
  `ItemDetailModal` so it's dismissable everywhere.
- [x] **Space top spacing:** `SpaceView` root now `pt-6 sm:pt-8`.
- [x] **Wider app + full-width layout:** `AppNav`/`DashboardView`/`SpaceView` →
  `max-w-[1240px]` (dashboard grid `lg:grid-cols-3`); `LayoutEditor` body is now
  `xl:flex-row` (canvas full-width with tool palette wrapping + properties panel
  **below** until `xl`), `ZoneProps` `xl:w-72` — removes the cramped horizontal scroll.
- [x] **Editor grid:** `FreeCanvas` draws a 24px (`UNIT`) alignment grid via two faint
  `--color-border-faint` gradients in `canvasStyle`.
- [x] **Distinguish editor chrome:** dropped the redundant editor back-arrow (Done
  exits); the bar is now a filled `surface-2` card with a pencil icon + `mt-6`
  spacing, clearly distinct from the space "Back to spaces" header.
- [x] **Login spacing:** check badge → heading gap bumped (`mt-4`→`mt-6`).
- [x] **Item icon override:** added optional `icon?: IconName` to `Item`; `ItemRow`,
  `ItemChip`, `ItemDetailModal` use `item.icon ?? itemIcon(name)`.
- [x] **Richer item add/edit:** new `ItemFormModal` (add + edit) — name, icon picker
  (`ITEM_ICONS` + Auto), quantity and **expiry date**; replaces `AddItemModal`. Wired
  layout add (creates then patches icon/expiry/depth/level) and a new Edit action on
  `ItemDetailModal` (`updateItem`).

### Phase 10.2 — Editor layout + levels follow-ups
More user feedback after 10.1. _(ref: user feedback 2026-06-19.)_
- [x] **Props always below:** `LayoutEditor` body is now always `flex-col` (tool
  palette row → full-width canvas → properties panel); `ZoneProps` is full-width with
  its fields in a `sm:grid-cols-2 lg:grid-cols-3` grid (Name + Delete span full).
- [x] **Levels stack top→bottom:** `ZoneProps` Levels field now shows a vertical
  L1…Ln preview (level 1 at top, accent dot each); `FreeCanvas` zone-card level bars
  changed from a horizontal row to a vertical stack.

### Phase 11 — Backend foundation (.NET)
- [x] Flesh out Domain/Application/Infrastructure/API: `TidansuDbContext`
  (`IdentityDbContext<User>`), DI `ServiceCollectionExtensions`, `JwtService`/
  `JwtSettings`, `EmailService` (file in dev), MediatR + FluentValidation +
  AutoMapper wiring; CORS/Serilog/Swagger; Kiota `build:api` scripts; initial
  migration. _(ref: SelfGrind backend, CLAUDE.md)_

### Phase 12 — Real magic-link auth + user/plan persistence
- [x] `User : IdentityUser` (+`Plan`,`SyncOn`); `MagicLinkToken` entity + repo. _(ref: handoff auth/plans)_
- [x] CQRS `RequestMagicLink` (issue + email one-time token) and `ConsumeMagicLink`
  (validate → issue JWT/refresh, create user if new, derive name, seed starter
  space); controller endpoints. _(ref: handoff auth, EmailService)_ _(also added
  `RefreshToken` rotation for item 3's refresh flow; server-side starter-space
  seeding deferred to Phase 13 — no `Space` entity yet, frontend keeps
  `seedStarterIfEmpty`.)_
- [x] Regenerate Kiota; replace mocked frontend auth with real calls (keep
  `returnUrl` + refresh flow). _(ref: useApiClient, tokenRefresh)_ _(automatic
  401-retry interception deferred to Phase 13 — no protected endpoint to exercise
  it yet; `useAuth.refresh` + backend rotation are in place and verified.)_

### Phase 13 — Spaces / zones / items persistence
- [x] Domain `Space`/`Zone`/`Item` + repos; CQRS CRUD for spaces/zones/items with
  **server-side limit enforcement** + downgrade read-only-over-cap rule. _(ref: handoff business rules)_
  _(whole-space persistence keyed by client uids — zone/item CRUD collapses into
  space create/update, preserving all client geometry/parse logic; limits enforced
  in handlers via `PlanLimits`, over-cap rejected with `PlanLimitException`→403
  `{plan:[reason]}`.)_
- [x] Account/usage + plan-change (pro/free) + sync endpoints. _(ref: handoff account)_
  _(`AccountController`: GET `/api/account` (profile+plan+sync+aggregate usage),
  PUT `/api/account/plan`, PUT `/api/account/sync` (Pro-gated → 403 `plan:sync`).)_
- [x] Regenerate Kiota; swap Pinia local stores to TanStack-Query-over-API (store
  shapes preserved). _(ref: CLAUDE.md frontend)_ _(spaces store hydrates from
  `GET /api/spaces` via the shared QueryClient, mutates optimistically + persists
  (immediate create/delete, debounced whole-space PUT); session plan/sync persist
  to `/api/account`; server 403 `{plan:[reason]}` opens the paywall + re-syncs.)_

### Phase 14 — Stripe-ready billing (deferred)
- [x] Put plan change behind a `BillingService` seam; add Stripe checkout +
  webhook → set plan. _(ref: handoff pricing behavior)_ _(`IBillingService` seam;
  `ChangePlan` routes through it returning an optional `checkoutUrl`. Default
  `DirectBillingService` flips the plan; config-gated `StripeBillingService`
  (checkout session + webhook→Pro) + `POST /api/billing/webhook`. Stripe off by
  default — built, not key-tested. Frontend `setPlan` redirects when a `checkoutUrl`
  is returned.)_

## Progress log

### 2026-06-21 — Phase 14 (Stripe-ready billing seam) — BUILD COMPLETE
- **Domain:** `Interfaces/IBillingService.cs` (`ChangePlanAsync` → `BillingChangeResult`
  {`CheckoutUrl?`}; `HandleWebhookAsync`). 
- **Application:** `ChangePlanCommand` now returns `ChangePlanResult` {`Account`,
  `CheckoutUrl?`}; handler delegates the plan change to `IBillingService` then
  composes the account/usage response. `Billing/Commands/HandleStripeWebhook`
  (command + handler → `IBillingService.HandleWebhookAsync`).
- **Infrastructure:** added `Stripe.net` 52.0.0. `StripeSettings` (Enabled +
  keys/price/urls; `IsConfigured`). `DirectBillingService` (default — flips plan via
  `IUserService`, webhook no-op). `StripeBillingService` (upgrade → Checkout session
  → `Redirect(url)`; downgrade → flip Free; webhook `ConstructEvent` signature-verified,
  `checkout.session.completed`→Pro via `ClientReferenceId`; bad signature →
  `ValidationException`→400; Domain `Plan` aliased past `Stripe.Plan`).
  `AddInfrastructure` registers Stripe when `IsConfigured`, else Direct.
- **API:** `BillingController` `POST /api/billing/webhook` (`[AllowAnonymous]`, reads
  raw body + `Stripe-Signature`). `AccountController.ChangePlan` returns
  `ChangePlanResult`. `appsettings.Development.json` gains `StripeSettings`
  (`Enabled:false`).
- **Frontend:** Kiota regenerated (`ChangePlanResult`, `/api/billing/webhook`).
  `useSessionStore.setPlan` optimistically flips, and on a returned `checkoutUrl`
  reverts + `window.location.href = checkoutUrl` (Stripe upgrade) — null in direct
  mode so the flip stands.
- **Verified** (API:5081 + Node, direct mode): plan→pro returns
  `{account.plan:"pro", checkoutUrl:null}` and persists (GET account → pro);
  plan→free works; `POST /api/billing/webhook` → 200 (direct no-op). `dotnet build`
  + `npm run build` green.
- **Deviation:** Stripe path is built but config-gated off (no keys to run against);
  subscription-cancellation on downgrade + customer↔user mapping for
  `subscription.deleted` left as TODOs in `StripeBillingService`.
- **Milestone:** Phases 1–14 complete.

### 2026-06-21 — Phase 13 item 3 (frontend swapped to live API) — PHASE 13 DONE
- **Kiota:** regenerated against the updated spec (now `/api/spaces[/{id}]` +
  `/api/account[/plan|sync]`). Fixed a generator/runtime skew durably in
  `fix-generated.mjs` — it now rewrites `getCollectionOfPrimitiveValues<T>()` →
  `…<T>("T")` (the installed kiota-abstractions requires the primitive-type arg);
  affected `tags`/`columnLabels`.
- **New frontend infra:** `api/spaceMapping.ts` (`toSpace`/`toDtoBody`; normalises
  the `rect` nullability gap — generated `ZoneDto.rect` is non-null but the server
  round-trips null for columns zones), `composables/useSpacesApi.ts` (list/create/
  update/remove + `planReasonOf` pulling the 403 `{plan:[reason]}` off the thrown
  error's `additionalData`), `composables/useAccountApi.ts`, shared
  `queryClient.ts` (installed via `VueQueryPlugin({queryClient})`).
- **Stores (shapes preserved):** `useSpacesStore` is now server-backed —
  `hydrate(force)` loads via `queryClient.fetchQuery(['spaces'])` and seeds the
  starter fridge server-side when empty; every mutation updates local state then
  persists (create/delete immediately; rename/items/zones/viewMode via a 400 ms
  debounced whole-space PUT); `reset()` clears local + query cache on sign-out.
  All action names/returns and getters unchanged → views untouched. Dropped the
  localStorage `tidansu_spaces` cache + `seedStarterIfEmpty`. `useSessionStore`
  `setPlan`/`setSync` persist optimistically to `/api/account`.
- **Wiring:** `useAuth.consume` awaits `spaces.hydrate(true)` before navigating and
  `signOut` calls `spaces.reset()`; `App.vue` `onMounted` re-hydrates when
  `auth.hasTokens` (reload); `useLimits` exposes module-level `openPaywall`/
  `closePaywall` so the store opens the paywall on a server cap.
- **Verified** (Chromium `verify-persist.mjs`, gitignored; API:5081 + vite:5173):
  fresh sign-in seeds "My fridge" server-side; smart-add "Persisted apple"; then
  **localStorage fully cleared** + re-login → the item still shows (server-sourced),
  `hasSpacesCache:false`; sign-out clears the token. Zero console errors.
  `dotnet build` + `npm run build` green.
- **Deviation:** auto 401-retry/refresh interception still deferred (the store logs
  sync errors; `useAuth.refresh` exists). TanStack Query backs the read path
  (`fetchQuery`/cache) while the Pinia store remains the reactive source the views
  mutate — the pragmatic shape-preserving integration.
- **Resume at:** Phase 14 — Stripe-ready billing behind a `BillingService` seam.

### 2026-06-21 — Phase 13 item 2 (account / usage / plan / sync endpoints)
- **Application `Account/`:** `Dtos/AccountDto.cs` (`From(user, usage)`; plan as
  lowercase) + `Dtos/UsageDto.cs` (`From(spaces)` → spaces/items/fullestSpace).
  `Queries/GetAccount`; `Commands/ChangePlan` (validator restricts to free/pro;
  persists `User.Plan`; downgrade keeps data — over-cap goes read-only on next
  `UpdateSpace`) and `Commands/SetSync` (Free + syncOn → `PlanLimitException(sync)`).
- **Infrastructure/Domain:** `IUserService.UpdateAsync` + `UserService` impl
  (UserManager.UpdateAsync, throws `ValidationException` on failure).
- **API:** `AccountController` (`[Authorize]`): `GET /api/account`,
  `PUT /api/account/plan`, `PUT /api/account/sync` (typed responses). No migration
  (Plan/SyncOn already on `User`).
- **Verified** (API:5081 + Node, fresh user): GET account → usage 0/0/0; after a
  3-item space → 1/3/3; PUT sync on while Free → 403 `{plan:[sync]}`; PUT plan→pro
  → 200; PUT sync on while Pro → 200 `syncOn:true`; PUT plan→free → 200; invalid
  plan → 400; no-token → 401. `dotnet build` green.
- **Resume at:** Phase 13, item 3 — regenerate Kiota + swap Pinia stores to
  TanStack-Query-over-API (store shapes preserved).

### 2026-06-21 — Phase 13 item 1 (spaces/zones/items persistence + limits)
- **Domain:** `Entities/Space.cs`/`Zone.cs`/`Item.cs` — keys are the client uids
  (`space_…`/`zone_…`/`item_…`) so zone/item references round-trip; union fields
  (type/viewMode/canvasMode/color/kind/facing/depth) stored as lowercase strings;
  `Zone` rect flattened to nullable `RectX/Y/W/H`; `ColumnLabels`/`Tags` are
  `List<string>` (EF JSON primitive collections); `Photo` nvarchar(max).
  `Constants/PlanLimits.cs` (Free 2 spaces / 6 zones / 50 items; `IsPro`/`AllowsPhotos`)
  + `PlanLimitReasons`; `Exceptions/PlanLimitException.cs` (carries `Reason`).
  `Repositories/ISpacesRepository.cs` (GetAllByUser/GetById(scoped to user)/CountByUser/
  Add/Remove/`ReplaceAsync`/SaveChanges). `IUserService` gained `FindByIdAsync`.
- **Infrastructure:** `TidansuDbContext` Space/Zone/Item config (string keys,
  user+children cascade FKs, `UserId` index, primitive collections);
  `SpacesRepository` (split-query includes; `ReplaceAsync` = RemoveRange children +
  SaveChanges, then re-attach new graph + SaveChanges, so reused ids don't collide).
  Registered `ISpacesRepository`.
- **Application `Spaces/`:** `Dtos` (`SpaceDto`/`ZoneDto`/`ItemDto`/`RectDto`, static
  `FromEntity`/`ToEntity`; rect null when `RectX` null; zones ordered by position).
  Queries `GetSpaces`/`GetSpace`; commands `CreateSpace`/`UpdateSpace`/`DeleteSpace`
  (+ validators). Create enforces space-count + zones/items/photos caps; Update
  enforces the **downgrade rule** (reject increases of an at/over-cap dimension;
  existing over-cap data stays editable) then `ReplaceAsync`. Duplicate stays
  client-side (builds a copy → CreateSpace).
- **API:** `SpacesController` (`[Authorize]`, GET/GET{id}/POST/PUT{id}/DELETE{id},
  typed `[ProducesResponseType<T>]`); `ErrorHandlingMiddleware` maps
  `PlanLimitException`→403 `{ errors: { plan: [reason] } }`.
- **Migration:** `SpacesZonesItems` (Spaces/Zones/Items tables, JSON columns) created
  **and applied** to localdb.
- **Verified** (API:5081 + Node, fresh user via magic-link): CREATE persists 3 zones/
  5 items; LIST returns it; 2nd CREATE ok (cap 2); 3rd→403 `spaces`; PUT s1→7 zones
  →403 `zones`; PUT s1 add photo→403 `photos`; legit PUT (rename + 6 items, graph
  replaced via reused ids)→200; DELETE→204; no-token→401. `dotnet build` green.
- **Design note:** chose whole-space persistence over per-zone/item endpoints —
  collapses CRUD, centralises limit checks, and keeps the client's geometry/parse
  helpers authoritative (item 3 store swap stays a thin load/save).
- **Resume at:** Phase 13, item 2 — account/usage + plan-change (pro/free) + sync
  endpoints.

### 2026-06-21 — Phase 12 item 3 (Kiota regen + real frontend auth) — PHASE 12 DONE
- **IDE fix (per user report):** "cannot resolve symbol Tidansu" in `Program.cs`
  was a stale IDE index, not a build error — `dotnet restore`/`build Tidansu.sln`
  are green; resolved by Invalidate Caches/reopen. No code change needed.
- **Kiota typing:** initial regen produced `Promise<ArrayBuffer>` because the
  controller's bare `[ProducesResponseType(200)]` declared no body schema. Switched
  to generic `[ProducesResponseType<ApiOperationResult<T>>(200)]` on all three
  actions → swagger now emits `AuthResponse`/`AuthUserDto`/`RequestMagicLinkResult`
  + `…ApiOperationResult` wrappers; client methods return the typed result.
- **Kiota pipeline note:** `swagger tofile` (Swashbuckle CLI) can't resolve the
  minimal-hosting entry point ("no Startup"), so the spec was fetched from the
  running API (`/swagger/v1/swagger.json` → `src/api/api.json`) before
  `build:api-fix`/`build:api-client`/`build:api-patch`. (`build:api-file` step
  still needs a host-factory fix to run unattended.)
- **Frontend infra:** `stores/useAuthStore.ts` (access/refresh/expiresAt persisted
  to `tidansu_auth`; `setTokens`/`clear`/`isAccessTokenValid`);
  `composables/useApiClient.ts` (singleton `DefaultRequestAdapter` +
  `BaseBearerTokenAuthenticationProvider` reading the access token,
  `baseUrl=window.location.origin` so `/api` is proxied in dev / same-origin in
  prod); `composables/useAuth.ts` (`requestMagicLink`/`consume`/`refresh`/`signOut`,
  mapping `AuthResponse`→stores).
- **Swaps:** `useSessionStore` lost the mocked `signIn`/`nameFromEmail`, gained
  `setUser(user, sync)` (server-fed, still seeds the starter space); `signOut`
  also resets `syncOn`. `LoginView` rewritten: state A sends the real link (shows
  dev "Open the link" from `devLink`), new consuming state, `onMounted` handles the
  `/login?token=…&returnUrl=…` callback, error copy on failure. `AccountView`
  sign-out now routes through `useAuth.signOut` (clears tokens + session).
- **Verified** (Chromium `verify-auth.mjs`, gitignored; API:5081 + vite:5173):
  `{hasAccessToken, hasRefreshToken}` true, `userName:"Verify User"` (server-derived
  from `verify.user`), `plan:"free"`, starter "My fridge" seeded, landed on
  `/account` (returnUrl honoured); token survives reload; sign-out clears token +
  user. API log shows magic-link 200 → consume 200 (account created). Zero console
  errors. `dotnet build` + `npm run build` green.
- **Deviations:** auto 401-retry interceptor deferred to Phase 13 (no protected
  endpoint yet) — `useAuth.refresh` + backend rotation exist and are verified; the
  generated Kiota client (`src/api/apiClient`, `api.json`) is committed.
- **Resume at:** Phase 13, item 1 — `Space`/`Zone`/`Item` domain + repos; CQRS CRUD
  with server-side limit enforcement + downgrade read-only-over-cap rule.

### 2026-06-21 — Phase 12 item 2 (real magic-link auth + endpoints)
- **Domain interfaces:** `IUserService` (find/create user — keeps Application free
  of `UserManager`) and `IMagicLinkEmailSender` (build link + email + dev-link
  return).
- **Application `Auth/`:** `Dtos/AuthResponse.cs` (`From(user, access, refresh,
  expiresIn)` factory; `User` aliased to dodge the `Tidansu.Application.User`
  namespace) + `Dtos/AuthUserDto.cs` (Plan as lowercase `"free"`/`"pro"` to match
  the frontend). Commands (triplet each): `RequestMagicLink` (→ `RequestMagicLinkResult`
  with dev-only `DevLink`; invalidates prior active links, 15-min single-use token,
  reuses `IJwtService` random+SHA-256), `ConsumeMagicLink` (hash-lookup → `IsActive`
  → burn → find/create user + derive name → JWT + stored refresh), `RefreshToken`
  (rotate: revoke presented, issue new). Validators on all three.
- **Infrastructure:** `UserService` (UserManager; new users `EmailConfirmed=true`,
  `Plan=Free`, throws `ValidationException` on identity failure), `MagicLinkEmailSender`
  (FrontendUrl from config, URL-escaped token+returnUrl, inline HTML email, returns
  the link only when `IsDevelopment()`). Both registered in `AddInfrastructure`.
- **API:** `Controllers/AuthController.cs` — `[AllowAnonymous]` `POST
  /api/auth/{magic-link,consume,refresh}`; magic-link + consume carry the `auth`
  rate-limit policy. Returns `ApiOperationResult.Ok(...)`.
- **Verified** (API on :5081, Development): swagger lists all three paths; Node
  drove request→`devLink` (token + `returnUrl=/account` round-trip), consume→200
  `{accessToken, refreshToken, expiresIn:3600, user{name:"Alex Smith", plan:"free",
  syncOn:false}}`, refresh→200 rotated pair, replay of the consumed token→401,
  old refresh after rotation→401. `dotnet build` 0 errors.
- **Deviations:** added `RefreshToken` rotation now (needed by item 3's refresh
  flow); server-side starter-space seeding deferred to Phase 13 (no `Space` entity
  yet) — the frontend keeps `seedStarterIfEmpty`. Magic-link raw token reuses
  `IJwtService.GenerateRefreshTokenAsync`/`HashRefreshToken` (generic random+SHA-256).
- **Resume at:** Phase 12, item 3 — regenerate Kiota + swap mocked frontend auth.

### 2026-06-21 — Phase 12 item 1 (User plan/sync + magic-link entity)
- **Domain:** `Enums/Plan.cs` (`Free=0`/`Pro=1`); `User` extended with
  `DisplayName` (derived from email local-part at first sign-in — pulled forward
  to avoid Phase 12 migration churn), `Plan Plan = Free`, `bool SyncOn`.
  `Entities/MagicLinkToken.cs` (Id, Email, TokenHash, CreatedAt, ExpiresAt,
  ConsumedAt; `IsActive` = not consumed && not expired — email-keyed since the
  link is requested before the user may exist, hash-at-rest like `RefreshToken`).
  `Repositories/IMagicLinkTokensRepository.cs` (`AddAsync`/`GetByHashAsync`/
  `InvalidateActiveForEmailAsync`/`SaveChangesAsync`).
- **Infrastructure:** `Repositories/MagicLinkTokensRepository.cs`
  (`InvalidateActiveForEmailAsync` uses `ExecuteUpdateAsync` to stamp `ConsumedAt`
  on still-active links). `TidansuDbContext` adds the `MagicLinkTokens` DbSet
  (unique `TokenHash` index + `Email` index, both hashes `nvarchar(64)`,
  `Email`/`DisplayName` `nvarchar(256)`) and a `User` config (`Plan` → string via
  `HasConversion<string>().HasMaxLength(16)`). `AddInfrastructure` registers
  `IMagicLinkTokensRepository`.
- **Migration:** `dotnet ef migrations add UserPlanAndMagicLinkTokens` →
  `20260621134914_UserPlanAndMagicLinkTokens` (+snapshot); edited the generated
  `Plan` column default from `""` to `"Free"` (table empty — auth not built yet, so
  cosmetic). **Applied** to `(localdb)\MSSQLLocalDB` `TidansuDb`.
- **Verified:** `dotnet build` 0 errors (10 inherited NU1903 warnings);
  `database update` applied cleanly.
- **Deviation:** added `DisplayName` now (plan item names only `Plan`/`SyncOn`) so
  Phase 12 item 2's "derive name" needs no further migration; `Plan` stored as a
  string (readable, matches the frontend `'free'|'pro'` literals) rather than int.
- **Resume at:** Phase 12, item 2 — CQRS `RequestMagicLink` (issue + email
  one-time token) and `ConsumeMagicLink` (validate → JWT/refresh, create user if
  new, derive name, seed starter space) + controller endpoints.

### 2026-06-20 — Phase 11 complete (backend foundation)
- **Domain** (`src/Tidansu.Domain`): `Entities/User.cs` (`User : IdentityUser`,
  minimal — `RefreshTokens` nav; Plan/SyncOn deferred to Phase 12),
  `Entities/RefreshToken.cs`; `Interfaces/IJwtService.cs` (+refresh) and
  `IEmailService.cs` (generic `SendEmailAsync(to,subject,html)` — no template files);
  `Exceptions/{NotFound,Validation,Authentication,Forbid}Exception.cs`;
  `Repositories/IRefreshTokensRepository.cs`.
- **Application** (`src/Tidansu.Application`): `Behaviors/ValidationBehavior.cs`
  (FluentValidation → domain `ValidationException`), `User/CurrentUser.cs` +
  `User/UserContext.cs` (`IUserContext`), `Extensions/ServiceCollectionExtensions.cs`
  `AddApplication` (MediatR + open `ValidationBehavior` + AutoMapper + validators +
  `IUserContext` + `AddHttpContextAccessor`) — assembly-scans cleanly with zero
  handlers/profiles registered so far.
- **Infrastructure** (`src/Tidansu.Infrastructure`):
  `Persistence/TidansuDbContext.cs` (`IdentityDbContext<User>` + `RefreshTokens`
  DbSet, unique `TokenHash` index, cascade FK); `Services/JwtService.cs` +
  `JwtSettings.cs` (HS256 access token, random refresh, SHA-256 hash-at-rest);
  `Services/EmailService.cs` (writes rendered HTML to `DevelopmentEmails/` in dev,
  SMTP in prod); `Repositories/RefreshTokensRepository.cs`;
  `Extensions/ServiceCollectionExtensions.cs` `AddInfrastructure` (SqlServer
  DbContext, `AddIdentityApiEndpoints<User>` + roles + EF stores, IdentityOptions,
  JWT, FluentEmail dev/prod sender, repos).
- **API** (`src/Tidansu.API`): `Program.cs` (AddInfrastructure/Presentation/
  Application, migrate-on-startup guarded by conn string, ErrorHandling →
  Swagger(dev)/HSTS(prod) → security headers → compression → static SPA → **CORS** →
  rate-limiter → auth(z) → controllers → SPA fallback);
  `Extensions/WebApplicationBuilderExtensions.cs` `AddPresentation` (JWT bearer w/
  prod secret guard, `frontend` CORS policy from `AppSettings:FrontendUrl`,
  controllers + `JsonStringEnumConverter`, SwaggerGen w/ bearer, `auth` rate-limit
  policy, Brotli/Gzip compression, Serilog); `Extensions/StringExtensions.cs`
  (`ToCamelCase`), `Middlewares/ErrorHandlingMiddleware.cs` (domain-exception → HTTP),
  `Models/ApiOperationResult.cs`. Namespaces use RootNamespace `Tidansu`
  (`Tidansu.Extensions`/`.Middlewares`/`.Models`).
- **Config:** `appsettings.json` (AppSettings/SmtpSettings/JwtSettings(no secret)/
  Serilog console+file) + `appsettings.Development.json` (localdb conn string,
  dev JWT secret, localhost SMTP, console Serilog, `FrontendUrl=:5173`).
- **Kiota pipeline:** `src/Tidansu.App/src/api/fix-openapi.mjs` +
  `fix-generated.mjs` ported; `build:api*` npm scripts already pointed at Tidansu.
- **Migration:** `dotnet ef migrations add InitialCreate` (Identity tables +
  RefreshTokens) → `20260620200904_InitialCreate` + snapshot; **applied** to
  `(localdb)\MSSQLLocalDB` Database `TidansuDb` via `database update`.
- **Verified:** `dotnet build` 0 errors (10 inherited NU1903 warnings — AutoMapper
  12.0.1 / System.Security.Cryptography.Xml 9.0.0, pre-existing pins); `dotnet run`
  boots → `GET /swagger/v1/swagger.json` 200 (empty paths — no controllers yet),
  `GET /` 200 serving the built SPA `index.html`.
- **Deviations from SelfGrind:** `IEmailService` is a generic HTML sender (no
  Razor templates / EmailModels / csproj content hack) so Phase 12 supplies the
  magic-link copy; `User` kept minimal (no domain props yet); seeded a `frontend`
  CORS policy (SelfGrind relied on same-origin). No dev-user seeding (auth is
  Phase 12). `RefreshToken` table shipped now to avoid Phase 12 migration churn.
- **Resume at:** Phase 12, item 1 — `User : IdentityUser` (+`Plan`,`SyncOn`);
  `MagicLinkToken` entity + repo.

### 2026-06-19 — Phase 10.2 complete (editor layout + levels)
- **Props always below:** `LayoutEditor` body is now always `flex-col` (no
  `xl:flex-row`) — tool palette wraps as a top row, canvas full-width, `ZoneProps`
  below. `ZoneProps` root dropped `xl:w-72`; its body is a
  `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` with Name and Delete spanning all
  columns so the full-width panel tiles cleanly.
- **Levels top→bottom:** `ZoneProps` Levels field gained a vertical preview
  (`levelPreview` = 1…min(levels,12); each row an accent-dotted `L{n}` chip,
  level 1 on top); `FreeCanvas` zone-card level bars switched from `flex` (row) to
  `flex flex-col` (stacked) with `w-10` bars.
- **Browser-verified** (headless Chromium, 1440px): selected a freeform zone, bumped
  Levels to 4 → properties panel renders below the canvas full-width, the L1–L4
  preview stacks vertically, and the zone card shows 4 stacked level bars.
  `levels:4`, zero console errors. `npm run build` green.
- **Resume at:** Phase 11, item 1 — backend foundation (unchanged).

### 2026-06-19 — Phase 10.1 complete (UX refinements)
- **Modal backdrop:** `BaseModal` close handler moved to the dim overlay div (the
  outer `@click.self` never fired). `ItemDetailModal` gained a ✕ close button and
  Edit/Remove action buttons (replacing the ⋯ popover) + an `edit` emit.
- **Layout/width:** `SpaceView` `pt-6 sm:pt-8` + `max-w-[1240px]`; `AppNav` and
  `DashboardView` → `1240px` (cards `lg:grid-cols-3`); `LayoutEditor` body
  `xl:flex-row` with the tool palette `flex-wrap xl:flex-col` and `ZoneProps`
  `xl:w-72` (canvas full-width / props below until xl) — kills the horizontal scroll.
- **Editor grid + chrome:** `FreeCanvas` `canvasStyle` adds a 24px two-gradient
  alignment grid; the editor bar is now a `surface-2` card (pencil icon, `mt-6`),
  redundant back-arrow removed (Done exits) — no longer confusable with the space
  header.
- **Items:** added optional `Item.icon` (`IconName`); `ItemRow`/`ItemChip`/
  `ItemDetailModal` render `item.icon ?? itemIcon(name)`. New `ItemFormModal`
  (add + edit) with name, icon picker (`ITEM_ICONS` const + Auto), quantity and
  expiry-date input — replaces `AddItemModal`; `SpaceView` wires layout-add (create
  then patch icon/expiry/depth/level) and item-edit (`updateItem`). Login state-B
  badge→heading gap bumped.
- **Browser-verified** (headless Chromium, `verify-ux.mjs`, gitignored, 1440px):
  item detail opens then **closes on backdrop click** (`detailOpen:true`/
  `detailClosed:true`); editing Milk set icon→`leaf`, qty→6, expiry; adding
  "Test apple" persisted with `leaf` icon + expiry; editor grid/chrome/props-below
  + wider layout render correctly; login spacing confirmed. Zero console errors.
  `npm run build` green.
- **Resume at:** Phase 11, item 1 — backend foundation (unchanged).

### 2026-06-19 — Phase 10 complete (landing + polish + responsive) — FRONTEND DONE
- **`views/LandingView.vue`:** full marketing page with its own chrome (Tidansu
  wordmark nav + footer) — 2-col hero (`lg:grid-cols-[1.05fr_0.95fr]`) with copy +
  a faux "My fridge" space-card illustration (mapped `heroShelves`: zone-accent
  strip + item chips), "How it works" 3-step band, 3 feature cards, pricing teaser
  (copy + Free/Pro mini-cards), final CTA, footer. Steps/features/shelves are
  mapped computed-style arrays; all CTAs are `RouterLink`s to login/pricing.
- **Responsive:** done with the codebase's Tailwind breakpoint utilities (matching
  AppNav's `sm:` pattern) rather than literal container queries — nav links
  `hidden sm:flex` with the CTA `max-sm:ml-auto`, hero collapses to 1 col below
  `lg`, step/feature grids `sm:grid-cols-3`, teaser `lg:grid-cols-2`.
- **QA / a11y pass:** grep confirms no `shadow-`/`gradient`/`drop-shadow` anywhere
  except the `elev-modal`/`elev-menu` helpers; added `focus-within:border-border-
  strong` to the two transparent-input wrappers (SmartAdd, ItemList search) so
  keyboard focus is visible (the other inputs already cue via `border-border-
  strong`); confirmed icon-only buttons carry `aria-label`/`title`.
- **Browser-verified** (headless Chromium, `verify-landing.mjs` + viewport shot,
  gitignored): desktop renders all sections faithfully; at 540/420px nav links hide
  and hero/steps/features stack to one column; "Get started" routes to /login.
  `navLinksVisibleDesktop:true`, `navLinksVisibleMobile:false`, `reachedLogin:true`,
  zero console errors. `npm run build` green.
- **Milestone:** Phases 1–10 complete — the full frontend (landing, auth, spaces
  dashboard + CRUD, create-space onboarding, list/layout/editor space views, plans/
  limits/paywall, pricing, account) is built, all on mocked Pinia state. Next is the
  .NET backend (Phases 11–14), then swapping the stores to TanStack-Query-over-API.
- **Resume at:** Phase 11, item 1 — backend foundation: flesh out Domain/Application/
  Infrastructure/API (`TidansuDbContext` `IdentityDbContext<User>`, DI, JWT, Email,
  MediatR/FluentValidation/AutoMapper, CORS/Serilog/Swagger, Kiota `build:api`,
  initial migration).

### 2026-06-19 — Phase 9 complete (account / settings)
- **`views/AccountView.vue`:** four cards on a 640px column — (1) **Profile**
  (initial avatar, name, email, plan pill via `BaseBadge`, pro=amber+sparkle);
  (2) **Plan** (`planLead` copy; Free → "Upgrade to Pro"→/pricing; Pro → "Manage
  billing"→/pricing + "Switch to Free"→`setPlan('free')`); (3) **Usage** — reuses
  `UsageMeter` for Spaces (`caps.spaces`), Items all-spaces (`itemsCap` =
  `caps.items × max(1,count)`, Infinity on Pro) and Fullest space (`caps.items`),
  with a Free-only per-space hint; (4) **Sync** — Pro-gated toggle row (lock + Pro
  badge on Free). `Back to spaces` link + full-width Sign out.
- **Sync enforcement (closes deferred Phase 7 item):** `onToggleSync` →
  `limits.guard(limits.checkSync())` — Free opens the **sync** paywall (no toggle),
  Pro flips `session.setSync`. All five limit firing points (spaces/zones/items/
  photos/sync) are now wired.
- **Browser-verified** (headless Chromium, `verify-account.mjs`, gitignored):
  Free → meters read 1/2 spaces, 10/50 items, 10/50 fullest, sync row locked;
  clicking it → **sync** paywall. Upgraded to Pro → plan card flips to Manage
  billing / Switch to Free, meters all "Unlimited", sync row unlocks; toggling it
  persists `syncOn:true`. `plan:pro`, `syncPaywall:true`, zero console errors.
  `npm run build` green.
- All templates follow the purity rule (computed strings/classes, named handlers).
- **Resume at:** Phase 10, item 1 — `LandingView` (hero 2-col, faux space-card
  illustration, how-it-works, features, pricing teaser, final CTA, footer).

### 2026-06-19 — Phase 8 complete (pricing)
- **`data/plans.ts`:** added `PLAN_FEATURES` (6 rows: spaces/zones/items/photos/
  sync/history with `fmt`), `PlanFeature` + `PlanFeatureKey` types — ported from
  `data.jsx`.
- **`components/pricing/PlanCard.vue`:** name + Pro/Current badges, tagline,
  `$amt/mo` (yearly = round(priceY/12), monthly = priceM), sub line (`forever` /
  `billed $48/yr` / `billed monthly`) + "save 20%" on Pro-yearly, check/x feature
  rows (off rows muted), CTA computed by state (Current plan disabled / Switch to
  Free secondary / Upgrade to Pro primary + sparkle). Pro card amber-tinted; current
  card gets an amber ring.
- **`views/PricingView.vue`:** Back link, hero (eyebrow/H1/sub), Monthly/Yearly
  segmented toggle (−20%), two `PlanCard`s, "Everything compared" table (Pro column
  tinted; mapped `comparison` computed), 2-question FAQ. `onUpgrade`/`onDowngrade`
  call `session.setPlan` then `returnToOrigin` (router.back, /spaces fallback);
  guests redirect to login with `returnUrl=/pricing`.
- **Browser-verified** (headless Chromium, `verify-pricing.mjs`, gitignored):
  yearly shows Pro $4/mo, monthly shows $5/mo; "Upgrade to Pro" → plan persists as
  `pro` + returns to `/spaces` + nav pill flips to Pro; revisiting pricing shows Pro
  "Current plan" (amber ring) and Free "Switch to Free". Zero console errors.
  `npm run build` green.
- All templates follow the purity rule (mapped computed arrays, computed classes,
  named handlers).
- **Resume at:** Phase 9, item 1 — `AccountView` profile card (initial avatar,
  name, email, plan pill).

### 2026-06-19 — Phase 7 complete (plans + limit-enforcement + paywall)
- **`composables/useLimits.ts`:** pure pre-mutate checks (`checkAddSpace`/
  `checkAddZone`/`checkAddItem`/`checkPhoto`/`checkSync`) returning the blocking
  `PaywallReason | null`; `guard(reason)` opens the paywall and returns `false`
  when blocked; shared **module-level** `paywallReason` ref (one paywall app-wide)
  + `openPaywall`/`closePaywall`/`isPaywallOpen`.
- **`data/paywall.ts`:** `PaywallReason` type (single source, re-exported by
  `useLimits`), `PAYWALL` reason copy (icon/title/body(n)) + `PAYWALL_BENEFITS`
  checklist — ported from `data.jsx`.
- **`components/paywall/PaywallModal.vue`:** lock/reason icon, Pro badge, title,
  cap-aware body, benefits list, "See Pro plans"→/pricing, "Not now", fine print.
  Reads the shared state; **mounted once in `App.vue`** so it works on PLAIN-layout
  routes (SpaceView/CreateSpace) too.
- **Enforcement wired (check-before-mutate, never mutate on cap):** `DashboardView`
  `goCreate`/`onDuplicate` → `spaces`; `SpaceView` `onAdd` (smart) + `confirmAdd`
  (in-layout) → `items`, `onAddColumnZone`/`onAddFreeZone` → `zones`,
  `onPhotoLocked` → `photos` (also closes the item detail so the paywall stacks on
  top). Sync has no UI yet → deferred to Phase 9 (`checkSync` ready).
- **Dashboard at-limit (`DashboardView`):** amber upsell banner (Upgrade→/pricing)
  + New-space tile flips to a locked affordance (lock icon, "Upgrade for more
  spaces", "You've used all N on Free") when `store.count >= caps.spaces`.
- **Browser-verified** (headless Chromium, `verify-paywall.mjs`, gitignored):
  duplicated fridge → 2/2 spaces, at-limit banner + locked tile render; locked tile
  → **spaces** paywall ("Space limit reached", cap 2); editor Add-shelf 5→6 allowed
  then 6→blocked → **zones** paywall (`fridgeZones` stayed 6 — no mutation); item
  detail photo slot → **photos** paywall (detail closed, paywall on top). All three
  `*Paywall:true`, `spaceCount:2`, zero console errors. `npm run build` green.
- **Resume at:** Phase 8, item 1 — `PricingView` (hero, monthly/yearly toggle, Free
  / Pro plan cards from `PLAN_FEATURES`).

### 2026-06-19 — Phase 6 complete (layout view + editor)
- **Layout view** (`components/space/layout/`): `LayoutView` (Shelves/Top
  toggle, pill, view notes, Edit-layout button); `ShelfElevation` (walls grouped
  by facing via `WALL_ORDER`/`FACINGS` + floor strip); `ShelfUnit` (per-unit
  levels stack, front/back depth tabs, meta); `LayoutTop` (columns grid +
  freeform mini-map with normalized offsets/canvas sizing); `MapZone` (top-down
  zone card with depth bands); `ItemChip` (expiry-warn styling, qty, select) +
  `AddChip`.
- **Editor** (`components/space/editor/`): `LayoutEditor` shell (back/Done,
  Draw-freely convert, tool palette); `ColumnsEdit` (structured per-column zone
  list + Add-shelf); `FreeCanvas` (pointer-driven draw/move/resize on a snapped
  24px grid, ghost rect, select + resize handle, delete tool, empty hint);
  `ZoneProps` (name override, type seg, color swatches, levels stepper, facing
  quad, depth toggle, column picker, delete). `AddItemModal` handles in-layout
  adds (name + qty).
- **Store:** `addZoneColumn`, `addZoneFree`, `updateZone`, `deleteZone`
  (cascades item removal), `convertToFreeform` (`flowFreeform` re-flow). Wired
  through `SpaceView`. Data helpers `itemsOf`/`FACINGS`/`WALL_ORDER`/
  `ZONE_COLORS`/`makeZone`/`flowFreeform` confirmed present.
- All new components follow **template purity** (mapped computed arrays for every
  `v-for`, named handlers, computed classes — no template logic).
- **Browser-verified** (headless Chromium, `verify-layout.mjs` + `verify-free.mjs`,
  gitignored): Shelves + Top views render zones/items/expiry; AddChip → modal →
  item added (10→11, "Test yogurt" on Shelf 1); columns editor lists zones +
  ZoneProps panel; Draw-freely converts (5 zones flowed, `canvasMode:freeform`);
  zone select shows resize handle; drawing in empty space creates "Shelf 6"
  (5→6 zones). Zero console errors across all flows. `npm run build` green
  (SpaceView chunk 48 kB).
- **Resume at:** Phase 7, item 1 — `useLimits` composable (pre-mutate checks for
  spaces≥2 / zones≥6 / items≥50 / photos / sync → paywall `reason`).

### 2026-06-18 — Phase 6 (part 1): list-view stack
- **Data:** `data/dates.ts` (DAY/now/inDays/daysUntil/expiryStatus/expiryLabel;
  `seed.ts` now imports it — DRY), `data/items.ts` (`parseAdd`, `matchZone`).
  `useColorVariant` re-exports `ExpiryStatus` from dates.
- **Store:** item actions `addItemSmart` (parse → matchZone → next slot index),
  `addItemStructured`, `removeItem`, `updateItem`, `setViewMode` (+`makeItem`).
- **Components (`components/space/`):** `SpaceHeader`, `SmartAdd` (NL field +
  example chips + barcode sample + "last added to"), `ItemList` (search +
  List/By-zone accordion with expiring counts + empty states), `ItemRow`,
  `ItemExpiry`, `SeeAsLayoutPromo`, `ItemDetailModal` (Zone/Expiry/Added rows +
  Pro-locked photo slot). `SpaceView` composes them; layout view is a stub.
- **Browser-verified:** opened seeded fridge → list view matches `screens-list`
  (accent bars, zone pills, color-coded expiry); smart-added "Sparkling water,
  door x6" → qty 6 routed to Door (10→11 items); By-zone accordion + item-detail
  modal (photo Pro-lock) render correctly. Zero console errors.
- **Remaining:** layout view + editor (the last Phase 6 checkbox).
- **Resume at:** Phase 6 final item — build spatial layout view (`screens-layout`)
  + layout editor (`screens-editor`), replacing the `SpaceView` layout stub.

### 2026-06-18 — Readability/DRY pass + Template-purity rule
- Added the **Template purity** hard rule to `CLAUDE.md` and
  `.claude/context/frontend-rules.md` (no logic in templates; `v-for` → mapped
  computed arrays).
- Refactored every existing component to comply: `BaseProgressBar` (`barStyle`),
  `UsageMeter` (`valueClass`), `AppNav` (`navLinks`/`avatarLabel`/`planBadgeVariant`),
  `SpaceCard` (named `onOpen/onRename/onDuplicate/onDelete`, `previewBands`,
  `openLabel`), `SpaceRenameModal`/`SpaceDeleteModal` (handlers + `canSave`/
  `itemsLabel`), `DashboardView` (modal `isOpen`/initial computeds + close
  handlers), `LoginView` (`sendDisabled`), `CreateSpaceView`
  (`complexityOptions`/`previewRows`/`spaceWord` + `selectComplexity`/`goToStep`),
  `ComplexityViz` (`boxClass`), `OnboardingStepBar` (`segments`/`stepLabel`).
- Verified clean via grep (no template ternaries/`??`/`!!`/inline-emit/assignments)
  and `npm run build` green.

### 2026-06-18 — Phase 5 complete (create-space onboarding)
- `data/onboarding.ts`: `COMPLEXITY` (simple/twodoors/draw + viz + Advanced flag),
  `DEFAULT_NAME`, `seedForType` (fridge → seedFridge; else empty build; then
  `applyComplexity`; viewMode `layout` for draw else `list`).
- Components: `OnboardingStepBar` (3 segments + "Step n of 3"), `ComplexityViz`
  (rows/cols/draw thumbnails). `CreateSpaceView` 3-step flow → `addSpace` + open.
- **Browser-verified** (headless Chromium): walked New space → Cabinet → "Two
  doors side by side" → confirm → Start adding items; result = "My cabinet",
  cabinet, 3 zones, `layoutColumns:2`, `columnLabels:["Left","Right"]`,
  viewMode list. Zero console errors. Step screenshots match the design (radio
  options + viz, "Advanced" badge; step 3 zone rows "Shelf 1/2 front/back",
  "Floor plain list · custom name"). Login state A + dashboard also confirmed
  against 02/04 screenshots.
- **Tooling note:** MCP browser tools unusable (chrome channel); using local
  `verify*.mjs` (gitignored) + bundled Chromium instead.
- **Resume at:** Phase 6, item 1 (port `parseAdd`/`matchZone`/`zoneName`/expiry/
  layout-geometry — most already in `data/spaces.ts`; add `data/items.ts`).

### 2026-06-18 — Phase 4 complete (spaces dashboard + CRUD)
- `useSpacesStore` gained `addSpace`/`renameSpace`/`duplicateSpace`/`deleteSpace`
  (duplicate remaps zone ids onto items, names "{name} copy", inserts after the
  original). Added `spaceTypeDef(id)` helper to `data/spaces.ts`.
- Components: `SpaceCard` (icon/name/type, ⋯ menu, ≤6 zone-band preview, counts +
  Open), `UsageMeter` (label + used/cap + bar; "Unlimited" for Pro — reused by
  Account in Phase 9), `SpaceRenameModal`, `SpaceDeleteModal`.
- `DashboardView`: header (H1 + "{n} spaces · {name}" + spaces meter + New space),
  2-col `SpaceCard` grid + dashed New-space tile, `BaseEmptyState`, rename/delete
  modal wiring. Open routes to `/spaces/:id` and sets `currentId`.
- Limit enforcement deferred to Phase 7 by design; `goCreate`/`onDuplicate` are
  single choke points ready to intercept.
- **Verify:** `npm run build` green (DashboardView chunk 11.4 kB).
- **Resume at:** Phase 5, item 1 (CreateSpaceView 3-step onboarding; data already
  ported in Phase 3 — `SPACE_TYPES`/`buildZones`/`applyComplexity`).

### 2026-06-18 — Phase 3 complete (mocked magic-link auth + data foundation)
- **Data foundation** (typed port of `data.jsx`, pulled forward because seeding
  needs it): `data/types.ts` (Space/Zone/Item/Plan shapes), `data/plans.ts`
  (PLANS, isInf, planOf), `data/spaces.ts` (catalogue + builders + layout
  geometry), `data/seed.ts` (seedFridge). `useColorVariant` now re-exports
  `ZoneColor` from `data/types` (single source).
- **Stores:** `useSpacesStore` (localStorage-persisted `spaces`/`currentId`,
  `seedStarterIfEmpty`, getters); `useSessionStore` expanded (user/plan/caps/
  syncOn, `signIn` derives name from email local-part + seeds starter space,
  `signOut`/`setPlan`/`setSync`, persisted).
- **`LoginView`:** state A (email + regex-gated "Send magic link") and state B
  ("Check your inbox", green check, demo "Open the link" → signIn → returnUrl or
  /spaces, "Use a different email"/"Resend").
- **Fixed** strict `noUncheckedIndexedAccess` issues in the ported data
  (tuple-typed `flowFreeform`, asserted zone destructuring, local slot-index var).
- **Verify:** `npm run build` (vue-tsc strict + vite) green. ⚠️ Interactive
  sign-in flow not yet exercised in a browser — Playwright Chrome isn't installed
  here; run `npm run dev` and walk /login → Open the link → /spaces to confirm.
- **Resume at:** Phase 4, item 1 (`useSpacesStore` CRUD: create/rename/duplicate/
  delete).

### 2026-06-18 — Phase 2 complete (routing + app shell + nav)
- `router/index.ts`: `AppViews` lazy map, `createRoute` helper, 7 routes with
  `requiresAuth`/`layoutType` meta, `beforeEach` guard (honors
  `VITE_DISABLE_AUTH`, `returnUrl`, guest-only redirect), `RouteMeta` module
  augmentation, `afterEach` doc titles.
- Layouts: `AppLayout` (sticky `AppNav` + gutter'd main), `PlainLayout` (bare);
  `App.vue` picks the layout from `route.meta.layoutType`. `main.ts` now installs
  the router.
- `AppNav`: Tidansu wordmark→/spaces, Spaces/Pricing links with active state,
  plan pill + initial avatar→/account when authed, else a Sign-in button.
- Placeholder views for all 7 routes (Landing/Login/Dashboard/CreateSpace/Space/
  Pricing/Account) so the app is navigable; each is replaced in its phase.
- **Deviation:** introduced a **minimal `useSessionStore`** now (the guard +
  `AppNav` need `isAuthenticated`/`plan`); Phase 3 expands it (login/out, seeding,
  derived limits). Recorded so Phase 3 starts from there, not from scratch.
- **Verify:** `npm run build` green → 147 modules, every view code-split.
- **Resume at:** Phase 3, item 1 (expand `useSessionStore` with user/plan/limits).

### 2026-06-18 — Phase 1 complete (scaffold + design tokens)
- **.NET:** `Tidansu.sln` with 4 buildable layer projects under `src/`
  (Domain/Application/Infrastructure/API, same package versions as SelfGrind),
  `global.json` (SDK 10.0.0), minimal API `Program.cs` with SPA fallback +
  appsettings/launchSettings. `dotnet build` → 0 errors (NuGet `NU1903` warnings
  for AutoMapper 12.0.1 / System.Security.Cryptography.Xml inherited from
  SelfGrind's pins — revisit on a backend security pass).
- **Vue app:** `src/Tidansu.App` scaffolded (package.json, vite→wwwroot, tsconfig
  trio, .prettierrc, .env with `VITE_DISABLE_AUTH=true`, .gitignore, index.html
  with Hanken Grotesk). `npm install` (226 pkgs).
- **Tokens:** `src/style.css` rewritten with the storebook OKLCH dark-warm theme
  + geometry/`--pad`/`--gutter` + elevation/eyebrow/scrollbar helpers.
- **Base components:** BaseIcon (+`components/icons.ts`), BaseButton, BaseBadge,
  BaseCard, BaseModal, BaseProgressBar, BasePopoverMenu(+Item), BaseEmptyState,
  BaseText, `base/index.ts`; composables `useModal`, `useColorVariant`. Temporary
  `App.vue` design-system smoke screen (replaced in Phase 2).
- **.claude:** copied + renamed to Tidansu; project `CLAUDE.md` written.
- **Verify:** `npm run build` (vue-tsc + vite) green → 121 modules to
  `Tidansu.API/wwwroot`; `npm run dev` boots and `GET /` → 200.
- **Deviations:** (1) backend cross-cutting code deferred to Phase 11; (2)
  API-coupled frontend infra (`useApiClient`/`tokenRefresh`/`useAuthStore`/
  `useForm`/`useFormErrors`) deferred to Phases 11–12 — they import the
  not-yet-generated Kiota client. Both honor the frontend-first decision.
- **Resume at:** Phase 2, item 1 (router + route table).

### 2026-06-18 — Plan created
- Wrote this plan. Decisions recorded: **real magic-link backend** (frontend
  screens mocked first), **frontend-first / backend later**, **Tidansu** naming
  (brand + code), **flag-now / Stripe-later** for payments.
- Reuse strategy fixed (see Conventions + plan): copy SelfGrind frontend config,
  auth/session infra, form/UI composables, base primitives (retheme), router
  pattern, backend cross-cutting/identity, and `.claude` config — renamed to
  Tidansu. Rebuild `style.css` tokens, all screens, icons, and data/helpers as
  typed TS.
- **Resume at:** Phase 1, item 1 (scaffold the .NET solution skeleton).

## Working rules

- Implement **ONE unchecked item at a time**, in order.
- After finishing an item: check its box, update `## Status`, append to
  `## Progress log`.
- Running low on context/tokens → **STOP at a clean checkpoint**, ensure this
  file is saved, and state the exact command to resume.
- **Never** check an item unless it actually builds/runs.
