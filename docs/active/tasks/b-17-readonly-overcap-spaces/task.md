---
id: B-17
slug: readonly-overcap-spaces
title: Reflect read-only over-cap spaces after downgrade in the UI (U-1)
status: done   # draft → requirements → tech-planning → in-progress → in-review → done | blocked
depends-on: []         # backlog ids that must land first (e.g. [B-5]); [] if none
touch-points:          # files / areas this task is expected to change (best current guess)
  - src/Tidansu.App/src/composables/useLimits.ts
  - src/Tidansu.App/src/views/DashboardView.vue
  - src/Tidansu.App/src/views/SpaceView.vue
---

# B-17 · Reflect read-only over-cap spaces after downgrade in the UI (U-1)

## Description
From the B-8 audit (🟠 U-1). The product rule and the app's own FAQ (`PricingView`)
promise that after a downgrade, spaces/items beyond the Free limits become
read-only — but nothing in the SPA enforces it. Guards only block *adding* past a
cap, so a Pro user who drops to Free keeps all over-cap spaces fully editable
(rename, add/edit/remove items, add zones) — the opposite of what the UI tells
them. Derive a per-space over-cap/read-only flag (spaces beyond `caps.spaces`,
by the existing stable dashboard list order — the server's stable `GetSpaces`
ordering — so the same spaces are read-only on every render), disable the
mutating affordances, and badge them "Read-only — upgrade to edit". Read-only
means content can't be changed, not hidden: viewing, list/layout switching and
**deleting** (the in-product recovery path back under the cap) stay available.
Full FRs: `./requirements.md`.

## Acceptance criteria
- [x] Spaces beyond `caps.spaces` (by the existing stable dashboard/server list order) are flagged read-only on Free plan.
- [x] Read-only spaces disable their mutating affordances (rename, add/edit/remove items, add/edit/delete zones, entering the layout editor).
- [x] Read-only spaces are badged "Read-only — upgrade to edit" on both the dashboard card and inside the open space.
- [x] Viewing (list/layout display, item detail read, navigation) and deleting a read-only space remain fully available.
- [x] Deleting an over-cap space (or upgrading) re-evaluates the flag live — no stale/lingering read-only state.
- [x] Upgrading back to Pro restores full editability with no lingering read-only state.
- [x] No regression to the existing add-past-cap paywall guards (`checkAddSpace`/`checkAddZone`/`checkAddItem`, locked "New space" tile, at-limit banner).

## Notes
- Server-side enforcement of the same rule is a **separate** concern (out of scope).
- Product rule (CLAUDE.md): "Downgrade keeps data but makes over-cap content read-only."
- Deterministic sort matters: the *same* spaces must be the over-cap ones on every render — use the existing stable server/dashboard list order (`OrderBy(s => s.Id)` server-side), not creation time or a client-only sort.
- Open questions for the product owner (see `requirements.md`): whether "Duplicate" should be disabled on a read-only card (assumed: leave as-is, falls through to the existing add-cap paywall); whether the badge needs a direct upgrade CTA vs. informational text (assumed: informational text for Phase 1).

### Implementation notes (2026-07-19, T6–T13)
- T6–T10 implemented exactly per tech-tasks (badge under `SpaceHeader`, Smart Add
  hidden, `ItemDetailModal` `canEdit` prop, `LayoutView`→`ShelfElevation`/`LayoutTop`
  →`ShelfUnit`/`MapZone` `readOnly` prop hiding "Edit layout" + every `AddChip`,
  `SpaceView` mutation-handler backstops, `DashboardView.onRename` backstop).
- ⚠️ **Flag for reviewer:** `ItemList`/`ItemRow`'s own inline per-row "Remove" (×)
  icon is **not** hidden on a read-only space — only `ItemDetailModal`'s Edit/Remove
  buttons were in T7's scope. The T9 backstop (`onRemove` early-returns when
  `readOnly`) guarantees no mutation succeeds if it's clicked, so there's no
  correctness gap — but it's a visible-but-inert control, which is inconsistent
  with this task's stated preference (hide, not just disable) for Smart Add and the
  layout "+" chips. Left as-is since tech-tasks explicitly scoped T7 to
  `ItemDetailModal.vue` only; flagging for a product/scope call rather than
  silently expanding into `ItemRow.vue`.
- T13 driven end-to-end against `dotnet run` + `npm run dev` (Development env,
  `DirectBillingService` — plan changes apply immediately, no Stripe). Verified via
  headless Edge over CDP: Pro with 3 spaces → downgrade → 3rd space (by server
  `OrderBy(s => s.Id)` order) badged read-only, Smart Add/Edit/Remove/Edit-layout/
  "+" chips all gone, list+layout+top-view still render and the inert `ItemRow`
  remove click was confirmed as a no-op → deleted the read-only space → badges
  cleared live → re-created a 3rd space, downgraded again, upgraded back to Pro via
  SPA in-app navigation (confirmed no reload via a `window.__marker` surviving
  every step) → badge cleared and Rename reappeared, still in the same session.

### Tech-planning notes (2026-07-19)
- Tech tasks written → [`./tech-tasks.md`](./tech-tasks.md). **Frontend-only**: no server change, no EF migration, no Kiota regen.
- **Key seam:** one `computed` in `useLimits.ts` — `readonlySpaceIds` = ids of `store.spaces.slice(caps.spaces)` (empty on Pro/unbounded) + `isSpaceReadOnly(id)`. Everything consumes that; views pass a plain `readOnly` prop down to dumb components. Enforcement stays at the view layer (beside existing `checkAdd*` guards), not pushed into the spaces store.
- Determinism = slice `store.spaces` **as-is** (server `OrderBy(s => s.Id)` order); never re-sort. Free cap 2 < page size 20, so over-cap spaces are always on the loaded first page.
- All 3 requirements-doc open questions resolved by the accepted scope decisions (Duplicate left as-is; badge informational; stable order = server list order).
- 🟠 High caveat for the human: this is UI-only; a JWT holder can still mutate via direct API. Server-side read-only enforcement is a separate follow-up backlog item.

## Stage artifacts
- Requirements → [`./requirements.md`](./requirements.md) — pm-requirements-analyst
- Technical tasks → [`./tech-tasks.md`](./tech-tasks.md) — tech-lead
- Review → [`./review.md`](./review.md) — branch-code-reviewer
