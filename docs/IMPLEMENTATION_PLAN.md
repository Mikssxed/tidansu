# Tidansu — Implementation Plan

Resumable, multi-session build plan for **Tidansu**, a spatial inventory app
recreated from `design_handoff_storebook/` on the **SelfGrind** stack
(.NET 10 Clean Architecture + CQRS backend; Vue 3 + Pinia + TanStack Query +
Kiota + PrimeVue-unstyled + Tailwind v4 frontend).

## Status

Phase 6 **partially** complete — list-view stack (smart add, item list/grouped,
expiry chips, item-detail modal, see-as-layout promo, space chrome) done + browser-
verified; **only the layout view + editor item remains**. `npm run build` green.
**Next:** Phase 6 last item → spatial layout view + layout editor (add/draw zone).

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
- [ ] Layout view (spatial zones) + Layout editor (add/draw zone). _(currently a
  stub in `SpaceView`; build `screens-layout.jsx` + `screens-editor.jsx`)_

### Phase 7 — Plans + limit-enforcement + paywall
- [ ] `useLimits` composable: pre-mutate checks for spaces≥2 / zones≥6 / items≥50 /
  photos / sync → returns paywall `reason`. _(ref: handoff Plans & Limits)_
- [ ] Wire enforcement into create/duplicate space (`spaces`), editor add-zone
  (`zones`), smart-add (`items`), photo (`photos`), sync toggle (`sync`). _(ref: handoff "where each limit fires")_
- [ ] `PaywallModal` keyed by `reason∈{spaces,zones,items,photos,sync}` with
  `PAYWALL` copy, Pro badge, benefits checklist, "See Pro plans"→/pricing, "Not
  now", fine print. _(ref: 05-paywall.png, screens-paywall.jsx)_
- [ ] Dashboard at-limit: amber upsell banner + locked New-space tile. _(ref: 04-dashboard.png)_

### Phase 8 — Pricing
- [ ] `PricingView`: hero (eyebrow Plans, H1), monthly/yearly toggle (−20%), two
  plan cards (Free / Pro amber + badge; `$5/mo` or `$4/mo billed $48/yr`), feature
  rows from `PLAN_FEATURES`. _(ref: 06-pricing.png, 07-pricing-plans.png)_
- [ ] Comparison table (6 features × Free/Pro, Pro tinted) + FAQ (downgrade keeps
  data read-only, cancel anytime). _(ref: screens-pricing.jsx)_
- [ ] Upgrade→`pro` / downgrade→`free`, return to origin route. _(ref: handoff pricing behavior)_

### Phase 9 — Account / settings
- [ ] `AccountView`: Profile card (initial avatar, name, email, plan pill). _(ref: 08-account.png)_
- [ ] Plan card (Free→Upgrade CTA; Pro→Manage billing / Switch to Free). _(ref: screens-account.jsx)_
- [ ] Usage meters: Spaces, Items across all spaces, Fullest space; warn color at cap. _(ref: 08-account.png)_
- [ ] Sync toggle row (Pro-gated → paywall `sync`) + Sign out. _(ref: handoff account)_

### Phase 10 — Landing + polish + responsive
- [ ] `LandingView`: hero 2-col (`1.05fr 0.95fr`), faux space-card illustration,
  "How it works" band (3 steps), Features (3 cards), Pricing teaser, Final CTA,
  footer. _(ref: 01-landing.png, screens-landing.jsx)_
- [ ] Container-query responsive (~720/560px): grids→1 col, nav links hide, plan
  cards stack. _(ref: handoff Responsive)_
- [ ] Visual QA vs all 8 screenshots; flat hairline borders, no gradients/shadows
  except menu/modal elevation; a11y (focus, tap targets, contrast). _(ref: handoff Fidelity)_

### Phase 11 — Backend foundation (.NET)
- [ ] Flesh out Domain/Application/Infrastructure/API: `TidansuDbContext`
  (`IdentityDbContext<User>`), DI `ServiceCollectionExtensions`, `JwtService`/
  `JwtSettings`, `EmailService` (file in dev), MediatR + FluentValidation +
  AutoMapper wiring; CORS/Serilog/Swagger; Kiota `build:api` scripts; initial
  migration. _(ref: SelfGrind backend, CLAUDE.md)_

### Phase 12 — Real magic-link auth + user/plan persistence
- [ ] `User : IdentityUser` (+`Plan`,`SyncOn`); `MagicLinkToken` entity + repo. _(ref: handoff auth/plans)_
- [ ] CQRS `RequestMagicLink` (issue + email one-time token) and `ConsumeMagicLink`
  (validate → issue JWT/refresh, create user if new, derive name, seed starter
  space); controller endpoints. _(ref: handoff auth, EmailService)_
- [ ] Regenerate Kiota; replace mocked frontend auth with real calls (keep
  `returnUrl` + refresh flow). _(ref: useApiClient, tokenRefresh)_

### Phase 13 — Spaces / zones / items persistence
- [ ] Domain `Space`/`Zone`/`Item` + repos; CQRS CRUD for spaces/zones/items with
  **server-side limit enforcement** + downgrade read-only-over-cap rule. _(ref: handoff business rules)_
- [ ] Account/usage + plan-change (pro/free) + sync endpoints. _(ref: handoff account)_
- [ ] Regenerate Kiota; swap Pinia local stores to TanStack-Query-over-API (store
  shapes preserved). _(ref: CLAUDE.md frontend)_

### Phase 14 — Stripe-ready billing (deferred)
- [ ] Put plan change behind a `BillingService` seam; add Stripe checkout +
  webhook → set plan. _(ref: handoff pricing behavior)_

## Progress log

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
