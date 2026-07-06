# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Overview

**Tidansu** is a spatial inventory app — users map physical storage (fridge,
freezer, cellar, cabinets) as real layouts and track what's inside, including
expiry dates. Free/Pro plans gate spaces, zones, items, photos and sync. It is
being recreated from the hi-fi design reference in `design_handoff_storebook/`
onto a .NET 10 + Vue 3 stack reused from the SelfGrind project.

**The build is tracked in `docs/IMPLEMENTATION_PLAN.md`** — a resumable,
multi-session plan. Always read it first, implement ONE unchecked item at a time
in order, then check the box, update `## Status`, and append to `## Progress log`.
Never check an item unless it actually builds/runs.

## Commands

### Frontend (run from `src/Tidansu.App`)
```bash
npm run dev         # Vite dev server (http://localhost:5173)
npm run build       # vue-tsc type-check + build to ../Tidansu.API/wwwroot
npm run build:api   # regenerate Kiota client from backend swagger (backend phases)
```
- `VITE_DISABLE_AUTH=true` in `.env` bypasses route auth guards during dev.

### Backend (run from `src/Tidansu.API`)
```bash
dotnet run          # start API on http://localhost:5081 (auto-migrates once wired)
dotnet build        # build the solution
```
EF migrations (from repo root):
```bash
dotnet ef migrations add <Name> --project src/Tidansu.Infrastructure --startup-project src/Tidansu.API
```

## Architecture

### Backend — Clean Architecture + CQRS (dependency direction API → Application → Domain ← Infrastructure)
- **`Tidansu.Domain`** — entities, repository interfaces, domain exceptions, constants.
- **`Tidansu.Application`** — MediatR command/query handlers, FluentValidation
  validators, AutoMapper profiles. Each feature in `Feature/Commands/DoThing/`.
- **`Tidansu.Infrastructure`** — EF Core `TidansuDbContext` (`IdentityDbContext<User>`),
  repository impls, `JwtService`, `EmailService` (file in dev).
- **`Tidansu.API`** — controllers delegate to MediatR only; `ErrorHandlingMiddleware`
  maps domain exceptions to HTTP. Backend is built in plan Phases 11–14.

### Frontend — Vue 3 + Composition API
- `src/api/apiClient/` — generated Kiota client (regenerate; don't hand-edit).
- `src/composables/` — `useApiClient`, `useModal`, `useColorVariant`, etc.
- `src/stores/` — Pinia (`useAuthStore` for JWT; `useSession`/`useSpaces` for app state).
- `src/router/` — Vue Router with `requiresAuth` + `layoutType` route meta.
- `src/components/base/` — shared UI primitives. PrimeVue is `unstyled:true`;
  all styling via Tailwind CSS v4.
- `src/data/` — typed ports of the prototype's `data.jsx` (SPACE_TYPES, PLANS, helpers).

### Frontend conventions (strict)
- **Variant-based styling** — `variant` union prop mapped to classes via
  `Record<Variant, string>`; never pass raw classes/hex as props.
- **All colors are `@theme` tokens** in `src/style.css` (storebook OKLCH dark-warm
  palette). Use `bg-surface-2`, `text-text-2`, `border-border`, `bg-zone-blue`,
  `text-warn`, etc. Never hardcode hex.
- **Static Tailwind classes only** (v4 static scan) — no dynamic `` `bg-${x}` ``.
- **Granular components**, **computed for all derived display values** (no logic in
  templates), **named handlers only** (no inline arrow logic).
- `twMerge()` when a component accepts external classes.

#### Template purity (HARD RULE — no logic in the template)

The `<template>` may only contain **plain property/getter access**, structural
directives, `v-model`, and **named event handlers**. Everything else lives in
`<script setup>` as a `computed` (for values/classes) or a named function (for
events). Specifically, the template must contain **none** of:

- arithmetic or string concatenation (`x + '%'`, `` `Open ${name}` ``) → `computed`
- ternaries / `!` / `!!` / `??` / `&&` used to produce a value or class
  (`:class="on ? 'a' : 'b'"`, `:disabled="!valid"`, `x?.y ?? 0`) → `computed`
- method calls that return display values or classes (`{{ fmt(x) }}`,
  `:class="rowClass(o)"`) → `computed`
- index / lookup access (`zoneBgClasses[z.color]`, `MAP[id]`) → `computed`
- inline assignments (`@click="step = 2"`) → named handler
- inline `emit(...)` (`@click="emit('open', id)"`) → named handler that calls `emit`
- inline arrow functions in handlers → named handler

For a `v-for` whose items need any derived value/class, **compute a fully-mapped
array first** (each element already carries its `label`, `meta`, `classes`,
`selected`, etc.) and iterate that — never compute per-row in the template.
Allowed as-is: `v-if="store.isPro"`, `:to="{ name: 'spaces' }"`, `v-model`,
`@click="onSave"`, `@click="selectType(s.id)"` (named handler taking a loop arg).

### Locked product config (ship, never expose as toggles)
Cards dashboard · Airy density (`--pad:1.18`) · Soft corners (`--radius-card:16px`,
`--radius-ctrl:11px`) · Smart add · "see as layout" prompt on. **No Tweaks panel,
no `forcePlan`.**

### Plans & limits (core logic)
Free: 2 spaces, 6 zones/space, 50 items/space, no photos, no sync. Pro: unlimited
+ photos + sync. **Check the limit before every mutate; on cap open the paywall
with the matching `reason` ∈ {spaces, zones, items, photos, sync} and do not
mutate.** Downgrade keeps data but makes over-cap content read-only.

## .claude/ reference

`.claude/context/` (architecture, backend-rules, frontend-rules, project-overview),
`.claude/skills/` (feature walkthroughs), and `.claude/templates/` carry detailed
patterns reused from SelfGrind. Treat domain examples there (tasks/XP) as
illustrative — Tidansu's domain is spaces/zones/items.

## Agent skills

### Issue tracker

Issues and PRDs live as **GitHub issues** in `Mikssxed/tidansu` (via the `gh` CLI);
external PRs are **not** a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles use their default strings (`needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

**Single-context** — one `CONTEXT.md` + `docs/adr/` at the repo root (created lazily
by `/domain-modeling`). See `docs/agents/domain.md`.
