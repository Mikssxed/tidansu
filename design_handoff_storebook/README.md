# Handoff: storebook — Multi-space, Accounts & Plans

## Overview

**storebook** is a spatial inventory app. Users map physical storage — fridge,
freezer, cellar, cabinets — as real layouts (levels, depth, walls) and track
what's inside, including expiry dates. This handoff covers the full product
surface built on top of the original single-space prototype:

- Marketing **landing page**
- **Magic-link (passwordless) auth** — sign in / register
- **Spaces dashboard** — create / rename / duplicate / delete spaces
- A **space** itself — list view + spatial layout view + layout editor
- **Pricing / subscription** page (Free vs Pro)
- **Account / settings** — profile, plan, usage meters, sync, sign out
- A **Free/Pro paywall** enforced at every limit

---

## About the Design Files

The files in this bundle are **design references created in HTML/React-in-Babel** —
prototypes that show the intended look and behavior. **They are not production
code to copy directly.**

The task is to **recreate these designs in the target codebase's existing
environment** (React, Vue, SwiftUI, native, etc.), using its established
component library, routing, state management, and styling patterns. If no
environment exists yet, choose the most appropriate framework for the project
and implement the designs there.

The prototype uses inline-Babel JSX with global components and a single
`localStorage`-backed store. **Do not replicate that architecture** — it's a
prototyping convenience. Lift the *visual design, copy, layout, interactions,
and business rules* described below into idiomatic code for your stack.

---

## Fidelity

**High-fidelity (hifi).** Final colors, typography, spacing, copy, and
interactions are all intentional. Recreate the UI pixel-accurately using your
codebase's libraries and patterns. Exact design tokens are listed at the bottom.

---

## ⚙️ Locked product configuration (IMPORTANT)

The prototype exposes several options through a **"Tweaks" panel** so the design
could be reviewed in different configurations. **The Tweaks panel is a
prototype-only review aid — do NOT ship it, and do NOT expose these as runtime
toggles.** Implement exactly this one configuration as fixed product behavior:

| Decision | Ship this value | Meaning |
|---|---|---|
| Dashboard layout | **Cards** | Grid of space cards, each with a mini layout preview (not rows, not boards) |
| Density | **Airy** | Generous padding — `--pad: 1.18` |
| Corners | **Soft** | `--r-card: 16px`, `--r-ctrl: 11px` (not sharp) |
| Add-item input | **Smart** | Single natural-language field that parses item + zone + qty |
| "See as layout" prompt | **On** | Show the prompt nudging users from the list view into the spatial layout |

Also drop the **`forcePlan` preview switch** entirely — real plan state comes
from the authenticated user's account.

---

## Screens / Views

### 1. Landing page
- **Purpose:** Convert a visitor to sign-up. Explains spatial inventory.
- **Layout:** Centered column, `max-width: 1000px`. Top nav (brand left;
  Pricing / Sign in / **Get started** CTA right). Sections in order:
  1. **Hero** — 2-col grid (`1.05fr 0.95fr`): copy left, illustration right.
     Eyebrow "Spatial inventory", H1 "Know what's on every shelf.", subcopy,
     two CTAs ("Get started — free", "See pricing"), reassurance line
     "Free for 2 spaces · no card needed".
  2. **Hero illustration** — a faux space card showing 3 colored shelves
     (Top shelf / Middle / Door) with item chips. Built from the app's own
     shelf vocabulary; rebuild as a static styled component or a screenshot.
  3. **How it works** — 3 steps in a bordered band: "Add it fast" / "Lay it
     out" / "Always know", each with an icon, `0N` number, title, description.
  4. **Features** — 3 cards: "Spaces for everything", "A real layout",
     "Expiry that warns you".
  5. **Pricing teaser** — 2-col panel: copy + "Compare plans" link on the left;
     Free and Pro mini cards on the right ($0 / $5·mo).
  6. **Final CTA** — centered "Put everything in its place." + Get started.
  7. **Footer** — brand, Pricing, Sign in, © line.
- **Behavior:** Get started / Sign in → auth screen. Pricing → pricing page.

### 2. Auth (magic link, passwordless)
- **Purpose:** Sign in OR register (same flow — the link creates the account if
  new).
- **Layout:** Centered card `max-width: 420px`. Back button top-left.
- **State A — enter email:** brand, H1 "Sign in or create your account",
  subcopy about no password, an email input, **"Send magic link"** button
  (disabled until the email matches `^[^@\s]+@[^@\s]+\.[^@\s]+$`), fine print
  "New here? The same link creates your account."
- **State B — link sent:** green check badge, H1 "Check your inbox", "We sent a
  magic link to **{email}**", a demo **"Open the link"** button (in the
  prototype this simulates clicking the email link → signs in), plus
  "Use a different email" / "Resend".
- **On auth success:** create the user (name derived from the email local-part:
  `alex.smith@x.com` → "Alex Smith"), default plan **free**, seed one starter
  space on first login, go to dashboard.
- **Production note:** wire State B to a real magic-link/OTP provider; the
  "Open the link" button is a prototype stand-in for the emailed link.

### 3. Spaces dashboard
- **Purpose:** Home base — pick a space or manage spaces.
- **Layout:** `max-width: 1000px`. Header row: H1 "Your spaces" + "{n} spaces ·
  {user name}" subtitle; right side a usage meter ("{used} of {cap} spaces" with
  a bar) and a **New space** button. Below: a **2-column grid of space cards**
  (the locked "cards" layout), with a dashed **"New space"** tile as the last
  cell.
- **Space card** contains: type icon, space name, type label, a **⋯ menu**
  (Rename / Duplicate / Delete), a **mini preview** of up to 6 zones as colored
  bands, and a footer with item count, zone count, and an "Open →" affordance.
- **At the free space limit:** an amber upsell banner appears ("You're at the
  Free limit…" + Upgrade). The New-space tile switches to a lock icon /
  "Upgrade for more spaces". Clicking New space when at the limit opens the
  **paywall** (reason `spaces`) instead of the create flow.
- **Empty state:** centered cabinet icon, "No spaces yet", description, "Create
  a space" button.
- **CRUD modals:**
  - *Rename* — name modal, pre-filled, Save.
  - *Delete* — confirm modal: "Delete space? …{name} and its {n} items will be
    permanently removed. This can't be undone." Danger button.
  - *Duplicate* — deep-copies the space (new ids on space, zones, items) with
    name "{name} copy"; **gated by the space limit** (paywall if at cap).

### 4. Create space (onboarding)
The original 3-step onboarding, now launched from the dashboard's New space:
type → complexity → confirm, with a **"Back to spaces"** affordance on step 1.
On completion the new space opens directly. (See `screens-onboarding.jsx` and
`data.jsx` `SPACE_TYPES` / `ZONE_TEMPLATES` / `applyComplexity`.)

### 5. Space — list / layout / editor
Pre-existing screens, unchanged in design but now wrapped by the multi-space
chrome (back-to-spaces button, space name + counts in the header, account
avatar). Key elements that interact with plans:
- **Smart add** (locked): one text field; `parseAdd(text)` extracts name, a zone
  hint, and quantity (e.g. `"milk, top shelf x2"`). New items are blocked at the
  item cap (paywall reason `items`).
- **Layout editor:** drawing/adding a zone (cabinet/shelf) is blocked at the
  zone cap (paywall reason `zones`).
- **Item detail modal:** has a **photo slot**. On Free it shows a "Pro" lock and
  opens the paywall (reason `photos`); on Pro it allows adding a photo.
- The **"see as layout" prompt** (locked on) nudges from list → layout for any
  non-list space type.

### 6. Pricing / subscription
- **Layout:** `max-width: 940px`. Back button. Centered hero (eyebrow "Plans",
  H1, subcopy) + a **monthly / yearly toggle** (yearly shows "−20%").
- **Two plan cards** (`1fr 1fr`): Free and Pro (Pro tinted amber, "Pro" badge).
  Each shows price (Pro: `$4/mo` shown when yearly with "billed $48/yr" + "save
  20%"; `$5/mo` when monthly), and a feature list (label left, value right) for
  the 6 comparison features. Current plan shows a disabled "Current plan"
  button; the other shows "Upgrade to Pro" / "Switch to Free".
- **Comparison table** — all 6 features × Free/Pro, Pro column tinted.
- **FAQ** — 2 cards: data on downgrade (nothing deleted; over-limit content
  becomes read-only), cancel anytime.
- **Behavior:** Upgrade sets the user's plan to `pro` and returns to wherever
  they came from. Downgrade sets `free`.

### 7. Account / settings
- **Layout:** `max-width: 640px`. Back button. Sections as bordered cards:
  - **Profile** — avatar (first initial), name, email, plan pill.
  - **Plan** — for Free: "Upgrade to Pro" CTA; for Pro: "Manage billing" /
    "Switch to Free".
  - **Usage** — three meters: Spaces (used/cap), Items across all spaces,
    Fullest space (vs per-space item cap). Bars turn warning-colored at the cap.
  - **Sync** — a toggle row, **Pro-gated**: tapping on Free opens the paywall
    (reason `sync`); on Pro it toggles sync on/off.
  - **Sign out** button.

### 8. Paywall modal (limit-reached)
A single reusable modal keyed by `reason ∈ {spaces, zones, items, photos, sync}`.
Each reason has its own icon, title, and body copy (see `PAYWALL` in `data.jsx`).
Shows a "Pro" badge, a benefits checklist (unlimited spaces / cabinets / items,
photos, sync), a primary **"See Pro plans"** button (→ pricing), a secondary
"Not now", and fine print "From $4/mo billed yearly · cancel anytime".

---

## Interactions & Behavior

- **App phases / routes:** `landing → auth → dashboard ⇄ create ⇄ app(space)`,
  with `pricing` and `account` reachable from the in-app nav and returning to
  wherever the user came from. Map these to real routes
  (`/`, `/login`, `/spaces`, `/spaces/new`, `/spaces/:id`, `/pricing`,
  `/account`).
- **In-app nav** (shown on dashboard/pricing/account): brand (→ spaces),
  Spaces / Pricing links, plan pill, account avatar.
- **Limit enforcement is the core new logic.** Every create/add action checks
  the user's plan limits *before* mutating, and opens the paywall instead when
  the cap is hit. See the rules table below.
- **Persistence:** prototype uses `localStorage`. Replace with your real
  backend / auth. The store shape is in `app.jsx` (`loadState`).
- **Responsive:** the prototype uses container queries on the app frame
  (breakpoints ~720px and ~560px) — grids collapse to a single column, nav
  links hide, plan cards stack. Apply your codebase's responsive conventions.

---

## Plans & Limits (business rules)

From `PLANS` in `data.jsx`:

| Capability | Free | Pro |
|---|---|---|
| Spaces | **2** | Unlimited |
| Cabinets / shelves (zones) per space | **6** | Unlimited |
| Items per space | **50** | Unlimited |
| Item photos | ❌ | ✅ |
| Sync across devices | ❌ (this device only) | ✅ |
| Change history | ❌ | ✅ |
| Price | $0 | **$5/mo or $48/yr** (≈ $4/mo, save 20%) |

**Where each limit fires (paywall `reason`):**

| Action | Check | Paywall reason |
|---|---|---|
| Create space / duplicate space | `spaces.length >= 2` | `spaces` |
| Draw/add a zone in the editor | `zones.length >= 6` | `zones` |
| Add an item | `items.length >= 50` (per space) | `items` |
| Add a photo to an item | plan has no photos | `photos` |
| Toggle sync on | plan has no sync | `sync` |

**Downgrade behavior (stated in FAQ, implement server-side):** nothing is
deleted; spaces/items beyond Free limits become **read-only** until the user is
back under the cap or upgrades again.

---

## State Management

State needed (prototype keeps it all in one store; split per your architecture):
- `user` — `{ name, email, plan: 'free' | 'pro' }` (or null when signed out)
- `spaces[]` — each: `{ id, name, type, canvasMode, layoutColumns, columnLabels,
  viewMode, zones[], items[] }`
  - `zone` — `{ id, position, label, color, hasDepth, floor, kind, facing,
    levels, column, rect }`
  - `item` — `{ id, name, zoneId, quantity, tags[], dateAdded, expiry, photo,
    slotIndex, depth, level }`
- `currentId` — open space
- `phase` / route, `view` (list|layout), `editing`, `grouped`
- `syncOn`
- transient UI: `selId` (open item), `selZoneId`, `addTarget`, `paywall {reason}`

Derived: `plan = PLANS[user.plan || 'free']`; limit checks use `Infinity` for
Pro (`isInf` helper).

---

## Design Tokens

Dark theme, warm-humanist, **flat** (hairline borders, **no gradients on
components, no drop shadows** except menu/modal elevation). All color in OKLCH.

**Surfaces**
- `--bg: oklch(0.165 0.006 264)`
- `--surface: oklch(0.205 0.007 264)`
- `--surface-2: oklch(0.245 0.008 264)`
- `--surface-3: oklch(0.285 0.009 264)`

**Hairlines**
- `--border: color-mix(in oklch, white 9%, transparent)`
- `--border-strong: white 15%`
- `--border-faint: white 5%`

**Text**
- `--text: oklch(0.965 0.004 264)`
- `--text-2: oklch(0.74 0.012 264)`
- `--text-3: oklch(0.56 0.012 264)`

**Primary action** (soft light-on-dark, not a saturated brand color)
- `--pri-bg: oklch(0.95 0.006 264)`  `--pri-fg: oklch(0.20 0.01 264)`

**Zone palette** (equal L/C, hue varies)
- blue `oklch(0.72 0.115 248)` · green `oklch(0.75 0.115 158)` ·
  amber `oklch(0.81 0.105 80)` · pink `oklch(0.74 0.115 350)` ·
  gray `oklch(0.72 0.022 264)`
- **Pro accent = amber.**

**Status**
- warn `oklch(0.80 0.13 70)` · danger `oklch(0.70 0.16 25)` ·
  ok `oklch(0.75 0.12 158)`

**Geometry (locked values)**
- `--r-card: 16px` · `--r-ctrl: 11px` · `--r-chip: 999px`
- Density `--pad: 1.18` (airy)
- Larger radii on big surfaces: landing/auth/pricing cards use 20px.

**Typography**
- Family: **Hanken Grotesk** (fallback `ui-sans-serif, system-ui`).
- Global `letter-spacing: -0.01em`; headings tighten further
  (`-0.02em` to `-0.04em`).
- Rough scale in use: hero H1 `clamp(34px,6vw,56px)/780`; page H1 `24–30px/770`;
  card titles `15–19px/750`; body `14–16px/1.5`; meta/labels `12–13px`.
  Eyebrows/kickers: `12px`, `700`, uppercase, `letter-spacing: .08em`.

**Spacing:** 4px-based; common gaps 6/8/9/12/14/16/22px. Page gutters
`clamp(16px,4vw,28px)`.

**Elevation:** only menus and modals use shadow
(`0 12px 30px color-mix(in oklch, black 45%, transparent)` for menus; modals a
soft dark backdrop). Cards are flat with hairline borders.

**Icons:** simple line icons, `stroke: currentColor` (Lucide/Tabler style). See
`icons.jsx` for the exact set/names used (`grid`, `plus`, `cabinet`, `columns`,
`box`, `lock`, `sparkle`, `restart`, `check`, `x`, `arrowR`, `arrowL`, `dots`,
`edit`, `trash`, `layers`, `search`, `list`, …).

---

## Assets

No external image/font binaries are required by the new screens — everything is
CSS + inline SVG icons. **Hanken Grotesk** is loaded from Google Fonts in
`index.html` (`<link>`); use your codebase's font-loading mechanism. The hero
"look inside" illustration is built from styled DOM (no image) — rebuild as a
component or substitute a real product screenshot.

---

## Screenshots

Reference renders of each screen are in `screenshots/` (dark theme, "Fit"
frame). Use them to match the visuals:

| File | Screen |
|---|---|
| `01-landing.png` | Marketing landing — hero + illustration |
| `02-auth-email.png` | Magic-link auth, enter-email state |
| `03-auth-sent.png` | Magic-link auth, "check your inbox" state |
| `04-dashboard.png` | Spaces dashboard (cards) at the Free limit, with upsell banner |
| `05-paywall.png` | Limit-reached paywall modal (reason: spaces) |
| `06-pricing.png` | Pricing page hero + billing toggle |
| `07-pricing-plans.png` | Pricing plan cards (Free vs Pro, yearly) |
| `08-account.png` | Account / settings — profile + usage meters |

---

## Files (in this bundle)

- `index.html` — entry; shows script load order and the Google Fonts link.
- `styles.css` — **all design tokens + every screen's styles** (most useful
  single reference).
- `data.jsx` — data model, `PLANS`, `PLAN_FEATURES`, `PAYWALL` copy,
  `SPACE_TYPES`, `ZONE_TEMPLATES`, and helpers (`parseAdd`, `matchZone`,
  `zoneName`, layout geometry, `applyComplexity`).
- `app.jsx` — store, phase/router, in-app nav, **limit-enforcement logic**,
  item/zone CRUD, item-detail & add modals. (`TWEAK_DEFAULTS` shows the locked
  config; ignore the Tweaks panel itself.)
- `screens-landing.jsx` — landing page.
- `screens-auth.jsx` — magic-link auth.
- `screens-dashboard.jsx` — spaces dashboard + card/row components + Name/Confirm
  modals. (Only the **cards** layout ships.)
- `screens-pricing.jsx` — pricing + comparison.
- `screens-account.jsx` — account/settings + usage meters.
- `screens-paywall.jsx` — the limit-reached modal.
- `screens-onboarding.jsx` — create-space flow.
- `screens-list.jsx`, `screens-layout.jsx`, `screens-editor.jsx` — the space
  views (smart add, spatial layout, layout editor).
- `icons.jsx` — line-icon set.
- `tweaks-panel.jsx` — **prototype-only; do not ship.**

> Reminder: these are **design references**. Recreate them in your stack's
> idioms — don't port the global-component / localStorage architecture.
