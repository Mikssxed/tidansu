# Audit Quick-Win Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the four low-risk, build-verifiable fixes from the 2026-06-21 audit (S1, S3, S5, C2) — closing a production auth-guard bypass, rate-limiting the refresh endpoint, sanitizing `returnUrl`, and removing a template-purity violation.

**Architecture:** Each fix is a small, self-contained change to an existing file (plus one new pure helper). No new dependencies, no schema changes, no architectural shifts. Backend changes verify with `dotnet build`; frontend changes verify with `npm run build`.

**Tech Stack:** .NET 10 (ASP.NET Core, MediatR), Vue 3 + TypeScript, Vite 7, vue-tsc.

## Global Constraints

- **No new dependencies.** All four fixes use existing framework features.
- **Frontend template purity (HARD RULE):** no logic in `<template>` — no ternaries/`!!`/`??`/arithmetic/concat/method-calls/lookups for values or classes; use `computed` + named handlers. (`CLAUDE.md`)
- **Static Tailwind classes only** — full class strings must appear as literals (v4 static scan); never build classes dynamically by interpolation.
- **Run frontend commands from** `src/Tidansu.App`. **Run backend commands from** `src/Tidansu.API` (or repo root for the solution).
- **Verification reality (finding C1):** the repo has **no test runner** (no xUnit project, no vitest). The documented verification is `dotnet build` and `npm run build` (`vue-tsc -b && vite build`) plus targeted code inspection. This plan therefore verifies via build + typecheck rather than unit tests. New pure logic (Task 3) is isolated into a standalone exported function so a unit test can attach later when test infrastructure (deferred finding C1) lands. **This is a deliberate deviation from TDD, forced by the absent test harness — flag it at review.**
- **Out of scope** (need their own design/plan, do not attempt here): S2 (httpOnly-cookie token storage re-architecture), S4 (refresh-token family reuse detection), C1 (test infrastructure), C3 (401-refresh interceptor, Stripe TODOs).

---

### Task 1: S1 — Stop the auth-guard bypass from reaching production

**Problem:** `VITE_DISABLE_AUTH=true` lives in the committed `.env`, which Vite loads in **all** modes — so `npm run build` bakes the guard-bypass into the production bundle. Fix it two ways (belt and suspenders): gate the bypass on `import.meta.env.DEV` (statically `false` in any build → dead-code-eliminated), and move the flag to `.env.development` (loaded only by `vite dev`, never by `vite build`).

**Files:**
- Modify: `src/Tidansu.App/src/router/index.ts:53-54`
- Modify: `src/Tidansu.App/.env`
- Create: `src/Tidansu.App/.env.development`
- Modify: `src/Tidansu.App/.gitignore`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks rely on.

- [ ] **Step 1: Gate the bypass on `import.meta.env.DEV` in the router guard**

In `src/Tidansu.App/src/router/index.ts`, replace the `requiresAuth` assignment (lines 53–54):

```ts
    const requiresAuth =
        import.meta.env.VITE_DISABLE_AUTH !== 'true' && to.meta.requiresAuth !== false;
```

with:

```ts
    // The dev-only auth bypass must never apply to a production build: import.meta.env.DEV
    // is statically false under `vite build`, so the bypass branch is dead-code-eliminated.
    const authDisabled = import.meta.env.DEV && import.meta.env.VITE_DISABLE_AUTH === 'true';
    const requiresAuth = !authDisabled && to.meta.requiresAuth !== false;
```

- [ ] **Step 2: Remove the flag from the committed `.env`**

Set `src/Tidansu.App/.env` to exactly:

```
BASE_URL=/
```

- [ ] **Step 3: Create `.env.development` with the dev-only flag**

Create `src/Tidansu.App/.env.development` with:

```
# Loaded only in dev mode (`vite dev` / `npm run dev`), never by `vite build`.
# Bypasses route auth guards so devs can navigate without signing in. Never affects prod.
VITE_DISABLE_AUTH=true
```

- [ ] **Step 4: Ignore local env override files**

In `src/Tidansu.App/.gitignore`, append:

```
# local env overrides
.env.local
.env.*.local
```

- [ ] **Step 5: Verify the production build is clean and typechecks**

Run (from `src/Tidansu.App`): `npm run build`
Expected: `vue-tsc -b` reports no errors and `vite build` completes, writing to `../Tidansu.API/wwwroot`. (Because `import.meta.env.DEV` is `false` in this build, the bypass branch is compiled out — the guard is active regardless of any stray env value.)

- [ ] **Step 6: Verify the dev path still bypasses**

Run (from `src/Tidansu.App`): `npm run dev` — confirm it starts, then stop it (Ctrl-C). The flag in `.env.development` keeps the bypass working in dev. (No automated assertion; this is a quick manual sanity check.)

- [ ] **Step 7: Commit**

```bash
git add src/Tidansu.App/src/router/index.ts src/Tidansu.App/.env src/Tidansu.App/.env.development src/Tidansu.App/.gitignore
git commit -m "fix(security): prevent auth-guard bypass from reaching production builds (S1)"
```

---

### Task 2: S3 — Rate-limit the refresh-token endpoint

**Problem:** `POST /api/auth/refresh` carries no rate-limit policy, while `magic-link` and `consume` do. Apply the existing `auth` fixed-window policy (10/min/IP) for consistency and defense-in-depth.

**Files:**
- Modify: `src/Tidansu.API/Controllers/AuthController.cs:42-50`

**Interfaces:**
- Consumes: `WebApplicationBuilderExtensions.AuthRateLimitPolicy` (existing `const string = "auth"`), already registered in `AddPresentation` and used by the other two auth actions.
- Produces: nothing other tasks rely on.

- [ ] **Step 1: Add the rate-limit attribute to the Refresh action**

In `src/Tidansu.API/Controllers/AuthController.cs`, the `Refresh` action currently reads:

```csharp
    /// <summary>Rotate a refresh token for a fresh JWT + refresh pair.</summary>
    [HttpPost("refresh")]
    [ProducesResponseType<ApiOperationResult<AuthResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<Ok<ApiOperationResult<AuthResponse>>> Refresh([FromBody] RefreshTokenCommand command)
```

Add the `EnableRateLimiting` attribute (matching the other two actions) so it becomes:

```csharp
    /// <summary>Rotate a refresh token for a fresh JWT + refresh pair.</summary>
    [HttpPost("refresh")]
    [EnableRateLimiting(WebApplicationBuilderExtensions.AuthRateLimitPolicy)]
    [ProducesResponseType<ApiOperationResult<AuthResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<Ok<ApiOperationResult<AuthResponse>>> Refresh([FromBody] RefreshTokenCommand command)
```

(The `using Microsoft.AspNetCore.RateLimiting;` and `using Tidansu.Extensions;` imports are already present at the top of the file — confirm they are; if not, add them.)

- [ ] **Step 2: Verify the backend builds**

Run (from repo root): `dotnet build Tidansu.sln`
Expected: Build succeeded, 0 errors. (Pre-existing inherited NU1903 warnings are expected and unrelated.)

- [ ] **Step 3: Commit**

```bash
git add src/Tidansu.API/Controllers/AuthController.cs
git commit -m "fix(security): rate-limit POST /api/auth/refresh (S3)"
```

---

### Task 3: S5 — Sanitize `returnUrl` to a same-site relative path

**Problem:** `returnUrl` flows from the query string / magic-link callback straight into `router.push(target)`. Validate it is a path rooted at a single `/` (rejecting absolute and protocol-relative `//` URLs) before use. Isolate the check in a pure, reusable helper.

**Files:**
- Create: `src/Tidansu.App/src/utils/returnUrl.ts`
- Modify: `src/Tidansu.App/src/views/auth/LoginView.vue` (script block: import, `returnUrl` computed ~lines 163-166, `openDevLink` ~lines 195-201)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `safeReturnUrl(raw: unknown): string | undefined` — returns `raw` only when it is a string beginning with a single `/` (not `//` or `/\`); otherwise `undefined`.

- [ ] **Step 1: Create the pure helper**

Create `src/Tidansu.App/src/utils/returnUrl.ts`:

```ts
/**
 * Returns `raw` only when it is a safe in-app destination: a path rooted at a
 * single "/" — not "//" or "/\", which browsers treat as protocol-relative and
 * can redirect off-site, and not an absolute "http(s)://" URL. Anything else
 * (absolute URLs, arrays, null/undefined) yields undefined so callers fall back
 * to their default route.
 *
 * Pure and dependency-free so it can be unit-tested directly once a test runner
 * is added (see audit finding C1).
 */
export function safeReturnUrl(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    if (!raw.startsWith('/')) return undefined;
    if (raw.startsWith('//') || raw.startsWith('/\\')) return undefined;
    return raw;
}
```

- [ ] **Step 2: Reference cases the helper must satisfy (documentation, not executed)**

These are the behaviors to keep in mind (and to turn into a vitest spec once C1 lands):

```ts
// safeReturnUrl('/account')          === '/account'   // ok: rooted relative path
// safeReturnUrl('/spaces/abc?x=1')   === '/spaces/abc?x=1'
// safeReturnUrl('//evil.com')        === undefined     // protocol-relative
// safeReturnUrl('/\\evil.com')       === undefined     // backslash variant
// safeReturnUrl('https://evil.com')  === undefined     // absolute URL
// safeReturnUrl('account')           === undefined     // not rooted
// safeReturnUrl(null)                === undefined
// safeReturnUrl(['/a', '/b'])        === undefined     // array query param
```

- [ ] **Step 3: Use the helper in LoginView's `returnUrl` computed**

In `src/Tidansu.App/src/views/auth/LoginView.vue`, add the import alongside the existing imports in `<script setup>`:

```ts
    import { safeReturnUrl } from '@/utils/returnUrl';
```

Then replace the existing `returnUrl` computed:

```ts
    const returnUrl = computed(() => {
        const value = route.query.returnUrl;
        return typeof value === 'string' ? value : undefined;
    });
```

with:

```ts
    const returnUrl = computed(() => safeReturnUrl(route.query.returnUrl));
```

- [ ] **Step 4: Sanitize the dev-link path in `openDevLink`**

In the same file, the `openDevLink` function currently reads:

```ts
    function openDevLink() {
        if (!devLink.value) return;
        const url = new URL(devLink.value);
        const token = url.searchParams.get('token');
        const target = url.searchParams.get('returnUrl') ?? undefined;
        if (token) void consumeToken(token, target);
    }
```

Replace the `target` line so it routes through the helper:

```ts
    function openDevLink() {
        if (!devLink.value) return;
        const url = new URL(devLink.value);
        const token = url.searchParams.get('token');
        const target = safeReturnUrl(url.searchParams.get('returnUrl'));
        if (token) void consumeToken(token, target);
    }
```

(The `onMounted` callback already passes `returnUrl.value`, which is now sanitized by Step 3 — no further change needed there. `consumeToken(token, target?: string)` keeps its signature; `target` stays `string | undefined`.)

- [ ] **Step 5: Verify the frontend builds and typechecks**

Run (from `src/Tidansu.App`): `npm run build`
Expected: `vue-tsc -b` passes (the new import resolves, `target` is `string | undefined` and is accepted by `consumeToken`), `vite build` completes.

- [ ] **Step 6: Commit**

```bash
git add src/Tidansu.App/src/utils/returnUrl.ts src/Tidansu.App/src/views/auth/LoginView.vue
git commit -m "fix(security): validate returnUrl is a same-site relative path (S5)"
```

---

### Task 4: C2 — Remove the template-purity violation in MapZone

**Problem:** `MapZone.vue:18` uses an inline ternary in `:class` (`band.labeled ? '…' : ''`), violating the project's HARD RULE that templates contain no logic. The `v-for` already iterates a mapped `bands` computed array, so the fix is to precompute each band's class string there and bind it directly.

**Files:**
- Modify: `src/Tidansu.App/src/components/space/layout/MapZone.vue` (template line 18; `bands` computed ~lines 85-98)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks rely on. (Each `band` object in the `bands` computed gains a `bandClass: string` field.)

- [ ] **Step 1: Add a named constant + `bandClass` to the mapped band objects**

In `src/Tidansu.App/src/components/space/layout/MapZone.vue` `<script setup>`, add a module-level constant just above the `bands` computed (the full Tailwind class string stays a literal for the static scanner):

```ts
    const LABELED_BAND_CLASS = 'rounded-ctrl border border-border-faint bg-surface-2 p-1.5';
```

Then in the `bands` computed, add a `bandClass` field to each returned object. The block currently reads:

```ts
            return {
                key: key ?? 'all',
                depth: (key ?? 'front') as ItemDepth,
                tag: key ? (key === 'back' ? 'Back' : 'Front') : '',
                labeled: key !== null,
                items,
                empty: items.length === 0,
            };
```

Change it to:

```ts
            return {
                key: key ?? 'all',
                depth: (key ?? 'front') as ItemDepth,
                tag: key ? (key === 'back' ? 'Back' : 'Front') : '',
                labeled: key !== null,
                bandClass: key !== null ? LABELED_BAND_CLASS : '',
                items,
                empty: items.length === 0,
            };
```

- [ ] **Step 2: Bind the precomputed class in the template**

In the same file, replace the band `<div>`'s class binding (line 18):

```html
                :class="band.labeled ? 'rounded-ctrl border border-border-faint bg-surface-2 p-1.5' : ''"
```

with:

```html
                :class="band.bandClass"
```

- [ ] **Step 3: Verify the frontend builds and typechecks**

Run (from `src/Tidansu.App`): `npm run build`
Expected: `vue-tsc -b` passes (`band.bandClass` is a known `string` field) and `vite build` completes. The rendered output is unchanged — labeled bands still get the card classes, unlabeled bands get none.

- [ ] **Step 4: Commit**

```bash
git add src/Tidansu.App/src/components/space/layout/MapZone.vue
git commit -m "refactor(frontend): precompute MapZone band class to honor template-purity rule (C2)"
```

---

## Self-Review

**Spec coverage** (against the four in-scope audit findings):
- **S1** → Task 1 (router `import.meta.env.DEV` gate + flag moved to `.env.development` + gitignore). ✓
- **S3** → Task 2 (`EnableRateLimiting` on the refresh action). ✓
- **S5** → Task 3 (`safeReturnUrl` helper + both LoginView read sites). ✓
- **C2** → Task 4 (precomputed `bandClass`, template binding replaced). ✓
- S2 / S4 / C1 / C3 — intentionally out of scope, stated in Global Constraints. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows exact before/after content. The "reference cases" in Task 3 Step 2 are explicitly documentation (no runner exists) and are not a verification gate. ✓

**Type consistency:** `safeReturnUrl(raw: unknown): string | undefined` is defined in Task 3 Step 1 and consumed in Steps 3–4; `target` stays `string | undefined`, matching `consumeToken(token: string, target?: string)`. Task 4 adds `bandClass: string` to each band and binds `band.bandClass`. `AuthRateLimitPolicy` is an existing const, not newly introduced. ✓

**Execution notes:** All four tasks are independent (no inter-task dependencies) and may be done in any order; each ends with its own build verification and commit. Do not execute on `main` — run on a dedicated branch (or worktree).
