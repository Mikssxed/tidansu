# Patterns — canonical exemplars

The fastest, most reliable way to add code to Tidansu is to **copy the shape of an
existing file that already does the same kind of thing**, then adapt it. This doc
is the index of those exemplars. It points at **real files** (not fabricated
snippets), so it stays correct as the code evolves — open the referenced file and
mirror it.

> The real domain is **spatial inventory: Space → Zone → Item** (plus Account,
> Auth, Billing, Plans). If you see `Task`/`TaskItem`/`Quest`/`api.tasks` anywhere
> in the older `.claude/context/*` examples, that is **stale SelfGrind text** —
> ignore it and follow the exemplars here.

---

## Backend (.NET 10 — Clean Architecture + CQRS/MediatR)

| You are adding… | Copy the shape of… | Notes |
|---|---|---|
| A **command** (state change) | `Tidansu.Application/Spaces/Commands/AddZone/` | The full triplet: `AddZoneCommand.cs` + `AddZoneCommandHandler.cs` + `AddZoneCommandValidator.cs`. |
| A **query** (read) | `Tidansu.Application/Spaces/Queries/GetSpace/` | `GetSpaceQuery.cs` + `GetSpaceQueryHandler.cs`. Reads are projection-only. |
| A **DTO + mapping** | `Tidansu.Application/Spaces/Dtos/ZoneDto.cs` | Mapping is **hand-written static methods** — `ZoneDto.FromEntity(entity)` and `dto.ToEntity(spaceId)` — **not** AutoMapper. Validators live beside the DTO (`ZoneDtoValidator.cs`). |
| A **repository** | interface `Tidansu.Domain/Repositories/ISpacesRepository.cs`; impl `Tidansu.Infrastructure/Repositories/SpacesRepository.cs` | Register the impl in `Infrastructure/Extensions/ServiceCollectionExtensions.cs`. Interface stays in Domain (no EF types). |
| A **controller** | `Tidansu.API/Controllers/SpaceZonesController.cs` (nested resource) or `SpacesController.cs` | Controller body is only `mediator.Send(...)`; wrap responses in `ApiOperationResult`. Route params bind onto the command (see `AddZoneCommand.SpaceId`). |
| A **domain exception** | `Tidansu.Domain/Exceptions/PlanLimitException.cs` | `ErrorHandlingMiddleware` maps it to a status code — never build HTTP results in a handler. |
| A **plan-cap rule** | `Tidansu.Domain/Constants/PlanPolicy.cs` (+ `PlanCaps.cs`) | Pure/static, table-tested in `tests/Tidansu.Domain.Tests`. Extend the tests when you change a rule — the interface is the test surface. |
| A **billing/webhook flow** | `Tidansu.Application/Billing/Commands/HandleStripeWebhook/` (+ `Infrastructure/Services/StripeBillingService.cs`) | Idempotency via `IProcessedStripeEventStore`. |
| An **auth/magic-link flow** | `Tidansu.Application/Auth/Commands/RequestMagicLink/` + `ConsumeMagicLink/` | Throttle via `IMagicLinkThrottle`; email via `IMagicLinkEmailSender`. |

### The three invariants every mutating handler enforces (in this order)

Read `AddZoneCommandHandler.cs` — it is the reference implementation. The order matters:

1. **Owner-scope first (IDOR guard).** Resolve the current user (`IUserContext` →
   `IUserService.FindByIdAsync`), then do an **owner-scoped** lookup/count. An
   unknown-or-other-user id must `throw new NotFoundException(...)` **before any
   other work or lock** — never trust a client-supplied id.
2. **Plan-gate before the mutation.** `if (PlanPolicy.CheckXxx(user.Plan, …) is
   { } reason) throw new PlanLimitException(reason);` with `reason ∈ {spaces,
   zones, items, photos, sync}`. Cheap pre-check, no lock.
3. **Atomic cap enforcement for finite (Free) caps.** The pre-check can race with
   concurrent adds, so the real enforcement is the atomic repo call
   (`AddZoneWithinCapAsync` → `sp_getapplock`, returns `ContentInsertOutcome`).
   Pro (unlimited) skips the lock. See the `zoneCap is int cap` branch.

### Backend gotchas (⚠️ watch out)
- **DTO mapping is static `ToEntity`/`FromEntity`, not AutoMapper** for the Spaces
  feature. Match the feature you're in.
- Every entity-field or `TidansuDbContext` change needs an **EF migration** in the
  same change.
- `ExecuteDeleteAsync`/`ExecuteUpdateAsync` run outside the current tracking
  transaction — see `feature-developer` memory before relying on them in a lock.
- **State the ownership predicate inline; never let it follow from a key being
  globally unique.** B-22 narrowed `Zone`/`Item` to `HasKey(SpaceId, Id)`, which turned
  every accidentally-safe `WHERE Id = @id` into a potential cross-tenant match.
  `SpacesRepository.RemoveItemAsync` is the exemplar: `i.SpaceId == spaceId` is written
  out even though the ownership `EXISTS` already implies it.
- **A client-supplied id that is an FK *principal* can't be composite-keyed — server-assign
  it instead.** B-22's `(SpaceId, Id)` fix does NOT transfer to `Space` (the tenancy root):
  `Zone`/`Item` FK to `Spaces.Id`, so re-keying `Space` to `(UserId, Id)` would either keep
  `Id` globally unique (re-opening the collision) or force adding `UserId` to both children.
  B-23's answer: `Space.Id` is **server-assigned by `ISpaceIdGenerator`** (CSPRNG, Domain
  interface + Infra impl), stays the sole PK, no migration. Ignore `dto.Id` on create.
- **A per-account rate-limit policy must run `app.UseRateLimiter()` AFTER
  `app.UseAuthentication()`/`UseAuthorization()` in `Program.cs`.** The partition
  function reads `httpContext.User`, which is empty until authentication has run;
  left before auth (as it was until B-23), the policy silently collapses to its IP
  fallback. The existing IP-keyed policies (auth/magic-link/webhook) are unaffected
  by this ordering either way — they key on `RemoteIpAddress`/a constant, not `User`.

---

## Frontend (Vue 3 — Composition API + Pinia + TanStack Query + Kiota + Tailwind v4)

| You are adding… | Copy the shape of… | Notes |
|---|---|---|
| A **base UI primitive** | `src/components/base/BaseButton.vue` (+ `base/index.ts`) | Variant union → `Record<Variant,string>` static class map; `twMerge` for external `class`. |
| …its **root element's classes** | `src/components/base/BaseBadge.vue:29-34` | Emit **one** `:class="classes"` — fold base + variant classes into a single `twMerge(base, variantClasses[props.variant])`. Never split a static `class="…"` alongside `:class` on the same element: twMerge can't see across the two, so same-property utilities (e.g. `bg-surface-2` + `bg-warn/10`) both survive and the winner falls out of `style.css` declaration order. |
| A **feature component** | `src/components/space/ItemRow.vue`, `spaces/SpaceCard.vue` | Feature comps live under `components/<feature>/`. Compose base primitives. |
| A **page view** | `src/views/SpaceView.vue`, `DashboardView.vue` | One view per route; views compose feature components, no raw UI logic. |
| A **data-access composable** | `src/composables/useSpacesApi.ts`, `useAccountApi.ts` | Wrap the Kiota call in TanStack Query `useQuery`/`useMutation`; mutations invalidate query keys. Never call the client outside a composable. |
| A **plan-cap / limit hook** | `src/composables/usePlanCaps.ts`, `useLimits.ts` | Maps a `null` numeric cap → `Infinity`. Drives the paywall. |
| A **paywall trigger** | `src/components/paywall/PaywallModal.vue` + `src/data/paywall.ts` | On a server `403 {plan:[reason]}`, open the paywall with the matching `reason`. |
| A **Pinia store** | `src/stores/useSpacesStore.ts`, `useSessionStore.ts` | Composition (setup) syntax. The spaces store batches edits and **flushes** them — see `data/pendingChanges.ts` and the `useSpacesStore.flush.test.ts` for the debounce/flush contract. |
| A **route** | `src/router/index.ts` | Add to the `AppViews` lazy-import map, then `createRoute(path, name, layoutType, requiresAuth)`. |

### Real composables & stores (the current set — the older frontend-rules table is stale)
- **Composables:** `useApiClient`, `useAuth`, `useSpacesApi`, `useAccountApi`,
  `useLimits`, `usePlanCaps`, `useModal`, `useColorVariant`.
  *(`useForm` / `useFormErrors` / `useNavigation` do **not** exist.)*
- **Stores:** `useAuthStore`, `useSessionStore`, `useSpacesStore`.
  *(Not "only useAuthStore" — that note is stale.)*
- **Dirs that don't exist:** `components/form/`, `components/icons/`, `schemas/`.
  Icons are `components/icons.ts` + `BaseIcon.vue`; there is no Zod `schemas/` dir.

### Frontend gotchas (⚠️ watch out)
- **Template-purity HARD RULE**: zero logic in `<template>`. For a `v-for` needing
  derived values, build a fully-mapped `computed` array and iterate that.
- **`@theme` token colors only** (`bg-surface-2`, `text-warn`, `bg-zone-blue`) —
  never hex, never dynamic `` `bg-${x}` `` (Tailwind v4 static scan).
- **Never hand-edit `src/api/apiClient/`** (a hook blocks it). After any API
  contract change: `dotnet build` the API → `npm run build:api` → `npm run build`.
- Never `any`; never re-declare a Kiota-generated type — import and narrow it.
- **A three-state async read** (loading / failed+Retry / genuinely-empty) copies
  `useSpacesStore.loadSpaceContents` + `SpaceView.vue`'s
  `isLoadingContents` / `loadFailed` blocks: state machine in the store, two boolean
  getters out, `BaseEmptyState` + `size="sm"` Retry in the view. Never let "empty
  array" stand in for "not loaded" — that's the B-16/B-18 bug class.
- There **is** a frontend test suite: `npm test` (`vitest run`), exemplar
  `src/stores/useSpacesStore.flush.test.ts` — mocks the api/queryClient modules and
  drives the Pinia store. Use it only for data-integrity cases with timing a manual
  browser drive can't hit; otherwise `npm run build` + a manual drive is the gate.
- **Never derive server ordering client-side.** Server "Id order" is DB-collation
  order (`SQL_Latin1_General_CP1_CI_AS` — CI, word-sort), which JS ordinal /
  `localeCompare` / array position cannot replicate. Order-dependent truth (e.g.
  the over-cap read-only set) is **server-sent** — `SpaceSummaryDto.IsOverCap`
  (B-25), computed from the same `PlanPolicy` predicate the enforcement guard uses.
- **Server-refresh triggers must key on *settlement*, not an optimistic flip.**
  `useSessionStore.setPlan` (and `setSync`) mutate state *before* the server call
  resolves — a `watch` on that state fires while the POST is still in flight, so a
  refetch it triggers races the commit and can be served pre-change data with no
  later trigger to correct it (B-25 M1). Fire such refetches from the mutation's
  `.then`/`.catch` (or an epoch ref bumped there), keeping the plain watch only for
  flips that arrive already-committed (e.g. via `AuthResponse`).
- **When a Pinia store composes another store in its `setup()`** (e.g.
  `useSpacesStore` calling `useSessionStore()` for a cross-store `watch`, B-25),
  every existing `*.test.ts` for the composing store needs a `vi.mock('@/stores/
  <composed>Store', ...)` added too, not just new tests — vitest runs in a plain
  node environment (no `jsdom`), so an un-mocked `useSessionStore` throws on its
  `localStorage.getItem` at store-setup time and breaks every prior test file.

---

## Where the rules live (so you don't hunt)

- **This file** — canonical exemplars (what to copy).
- `.claude/context/architecture.md` — layer/dependency map.
- `.claude/context/backend-rules.md` · `frontend-rules.md` — the conventions in
  prose (principles are correct; ignore any stale `Task`/`Quest` example names).
- `.claude/skills/*.md` + `.claude/templates/*` — step-by-step walkthroughs +
  code templates for each artifact type.
- `CLAUDE.md` — the authoritative product/config rules.
