# B-17 · Tech Tasks — Reflect read-only over-cap spaces after downgrade (U-1)

**Scope: frontend-only.** No server change, no schema/EF migration, no new endpoint,
**no Kiota regen**. The read-only rule is a *presentation/interaction* gate layered on
data the dashboard already has (`session.caps.spaces` + the existing `store.spaces`
list order). Server-side enforcement of the same rule is a **separate, out-of-scope**
concern (see Security).

**The seam (read this first).** The whole feature hangs off **one derived value**: a
computed set of "read-only space ids" = every space *after* the first `caps.spaces` in
the store's existing list order, empty when the cap is unbounded (Pro). It lives in
`useLimits` next to the existing `checkAdd*` gates, is a live `computed` over two
already-reactive sources (`session.caps` + `store.spaces`), and everything else just
consumes it. Views (`DashboardView`, `SpaceView`) read it and pass a plain `readOnly`
boolean down to dumb child components as props — children never call the composable.
This mirrors how the existing add-cap guards sit in the views (`limits.guard(...)`),
not in the store.

Traceability: FR-1 → T1; FR-2 → T2, T4, T6; FR-3 → T4, T10; FR-4 → T6, T7, T8, T9;
FR-5 → (no change — verified) T13; FR-6 → (no change — verified) T13; FR-7 → T1 (falls
out of the computed) + T13; FR-8 → (no regression — verified) T13.

---

## 1. 📋 Technical Tasks

### Frontend — Composables/Stores

- [x] **T1** · add read-only-space derivation to `useLimits` in `src/Tidansu.App/src/composables/useLimits.ts`
  - Add a `readonlySpaceIds = computed<Set<string>>(...)`: when `isInf(session.caps.spaces)` return an **empty set**; otherwise return the ids of `spaces.spaces.slice(cap)` (every space *past* the first `cap` in the store's existing order). Add `isSpaceReadOnly(id: string): boolean` reading that set, and export both from the returned object.
  - Mirror the shape of the existing `checkAddSpace()` in the same file (same `session.caps.spaces` + `isInf` + `spaces` store inputs) — this is the same cap, evaluated positionally instead of as a count.
  - *Why here:* `useLimits` already couples `useSessionStore().caps` and `useSpacesStore()` and is the canonical "plan-cap / limit hook" (patterns.md). Keeping the flag beside `checkAdd*` keeps one home for every cap decision.
  - ⚠️ **Determinism watch-out (the crux):** slice **`store.spaces` as-is** — that is the dashboard/server list order (`GetSpaces` is `OrderBy(s => s.Id)`). Do **not** re-sort, and do **not** key off creation time or a client-local array mutation order — a set that shuffles per render would look like data corruption (requirements ⚠️). Because it is a `computed` over `session.caps` + `store.spaces` (both reactive), it re-derives live on downgrade, upgrade (FR-7), space add and space delete (FR-6) with no snapshot and no "unlock" step.
  - ⚠️ Free cap is 2 and page size is 20, so every over-cap space is on the already-loaded first page — pagination never hides one. (If a future plan sets a finite cap ≥ 20 this assumption breaks; note it, don't solve it now.)

### Frontend — Components/Views

- [x] **T2** · create `SpaceReadonlyBadge.vue` in `src/Tidansu.App/src/components/spaces/SpaceReadonlyBadge.vue`
  - Granular presentational component: a `BaseBadge` (`variant="warn"`, `src/components/base/BaseBadge.vue`) with a `lock` `BaseIcon` and the **exact** static text `Read-only — upgrade to edit`. No props, no logic (informational only, per the accepted scope decision — no upgrade CTA in Phase 1).
  - *Why a component (not two inline literals):* the badge appears on the card **and** inside the open space (FR-2); one component keeps the copy DRY and identical.
  - ⚠️ `@theme` tokens only via `BaseBadge`'s variant map — no hex, static classes.

- [x] **T3** · build the read-only-mapped card array in `src/Tidansu.App/src/views/DashboardView.vue`
  - Use the new `isSpaceReadOnly` from the already-present `limits`, then add a `computed` `spaceCards = store.spaces.map(s => ({ space: s, readOnly: limits.isSpaceReadOnly(s.id) }))`; iterate **that** in the `v-for`, not `store.spaces`.
  - 🔒 blocked by: T1
  - ⚠️ **Template-purity HARD RULE:** `isSpaceReadOnly(space.id)` is a value-producing method call — it must **not** appear in the template. Pre-map it into the computed array (the fully-mapped `v-for` array pattern) and bind `:read-only="card.readOnly"`.

- [x] **T4** · add a `readOnly` prop to `src/Tidansu.App/src/components/spaces/SpaceCard.vue` (FR-2, FR-3)
  - Add `readOnly?: boolean` to `SpaceCardProps`. When true: render `SpaceReadonlyBadge` in the card header, and **disable the "Rename" `BasePopoverMenuItem`** (add a `disabled` state, or `v-if="!readOnly"` to remove it). Keep **Duplicate** and **Delete** untouched (scope decision: Duplicate falls through to the existing `checkAddSpace` paywall; Delete is the recovery path, FR-6).
  - 🔒 blocked by: T2
  - *Why prop, not composable:* `SpaceCard` stays a dumb presentational component; the view owns the plan decision. Mirror the existing dumb-component-with-props shape (`ItemRow.vue`).
  - ⚠️ If `BasePopoverMenuItem` has no `disabled` affordance, prefer `v-if="!readOnly"` to hide Rename over inventing one — confirm the menu still renders with two items.

- [x] **T5** · pass `readOnly` from card array to `SpaceCard` in `src/Tidansu.App/src/views/DashboardView.vue`
  - Bind `:read-only="card.readOnly"` on `<SpaceCard>` and iterate `spaceCards`.
  - 🔒 blocked by: T3, T4

- [x] **T6** · surface read-only inside the open space in `src/Tidansu.App/src/views/SpaceView.vue` (FR-2, FR-4)
  - Add `const readOnly = computed(() => limits.isSpaceReadOnly(props.id))` (`limits` already imported).
  - Render `SpaceReadonlyBadge` near the top, just under `<SpaceHeader>` (scope decision: near the header, not inside it — keeps `SpaceHeader` uncoupled; the list/layout toggle it owns must keep working, FR-5).
  - Hide **Smart Add** on a read-only space: wrap the `<SmartAdd>` block in `v-if="!readOnly"` (FR-4). *Do not edit `SmartAdd.vue` itself.*
  - 🔒 blocked by: T1, T2

- [x] **T7** · gate item Edit/Remove in `src/Tidansu.App/src/components/space/ItemDetailModal.vue` (FR-4)
  - Add a `canEdit?: boolean` (default `true`) prop; when false, **hide** the Edit and Remove `BaseButton`s (the two-button block at the top) — leave everything else (zone, expiry, added, photo slot) so *viewing* is unaffected (FR-5). Pass `:can-edit="!readOnly"` from `SpaceView`'s `<ItemDetailModal>`.
  - 🔒 blocked by: T6
  - ⚠️ Keep the modal itself openable when read-only — a user must still open an item to **read** it (FR-5); only the mutating buttons disappear.

- [x] **T8** · gate layout-editor entry + in-slot item add in the layout view (FR-4)
  - `src/Tidansu.App/src/components/space/LayoutView.vue`: add `readOnly?: boolean`; when true, **hide the "Edit layout" `BaseButton`** (blocks entering the zone editor → zone add/edit/delete + convert), and thread `readOnly` down to `ShelfElevation`/`LayoutTop` so their in-slot **add "+" affordances** are hidden. Trace the `@add` emit chain: `LayoutView → ShelfElevation`/`LayoutTop → ShelfUnit`/`AddChip`/`MapZone` (`src/Tidansu.App/src/components/space/layout/`) — hide `AddChip` when `readOnly`. Keep zone/item **selection** (`@select`) and the Shelves/Top-view toggle working (viewing, FR-5).
  - Pass `:read-only="readOnly"` from `SpaceView`'s `<LayoutView>`.
  - 🔒 blocked by: T6
  - *Why thread the prop:* the "+" chips are item-add entry points; hiding only "Edit layout" would leave item adds reachable in layout mode. Prefer a `readOnly`/`interactive` prop over per-chip logic.

- [x] **T9** · add correctness backstops in `src/Tidansu.App/src/views/SpaceView.vue` mutation handlers (FR-4 — "no mutation succeeds via any UI path")
  - Early-return `if (readOnly.value) return;` at the top of every content-mutating handler: `onAdd`, `onRemove`, the add branch of `onFormSubmit`, `onEditItem`, `onAddColumnZone`, `onAddFreeZone`, `onUpdateZone`, `onDeleteZone`, `onConvert`. Place it beside the existing `limits.guard(limits.checkAddItem(...))` calls.
  - **Leave the view toggle (`onSetView`), `onSelect`, `closeDetail`, `onRetry` untouched** — those are read/navigation, must stay live (FR-5).
  - 🔒 blocked by: T1
  - *Why both hide-in-child and backstop-in-view:* hiding controls is the UX; the handler guard is the guarantee that even a missed control (e.g. an `AddChip` reachable in some state) can never mutate. The store stays the pure mutation mechanism — no plan logic pushed into it.

- [x] **T10** · block Rename dispatch defensively in `src/Tidansu.App/src/views/DashboardView.vue` (FR-3 backstop)
  - In `onRename(id)`, early-return when `limits.isSpaceReadOnly(id)` so the rename modal never opens for a read-only space even if T4's disabled state is bypassed. Leave `onDuplicate` (checkAddSpace paywall) and `onDelete` (FR-6) unchanged.
  - 🔒 blocked by: T1

### Refactoring

- [x] **T11** · [refactor] confirm no template-purity regressions in touched files
  - Verify T3/T5's `v-for` maps every derived value (`readOnly`) into the computed array (no method call in template); verify `SpaceReadonlyBadge`, the `SpaceCard` badge/menu, `ItemDetailModal`, and `LayoutView` bindings are plain property access / named handlers only. Scope strictly to files touched by T1–T10 — no unrelated refactors.
  - No refactoring needed beyond this check unless the review above surfaces a violation.

### Verification (frontend-only — no Domain test surface applies)

- [x] **T12** · `npm run build` (vue-tsc type-check + build) green from `src/Tidansu.App`. No new `any`, no re-declared Kiota types. (No `dotnet build` / `npm run build:api` — nothing backend or contract-level changed.)
- [x] **T13** · manual end-to-end drive in the running app (`run`/`verify` skills). Because Free is capped at 2, you can only *reach* an over-cap state by starting on **Pro**:
  1. On **Pro**, create **3+ spaces** with some zones/items.
  2. **Downgrade to Free** (Account view plan change). **Expect:** spaces 3+ (by list order) show the `Read-only — upgrade to edit` badge on their dashboard cards; spaces 1–2 do not (FR-1, FR-2).
  3. Open a read-only space. **Expect:** badge under the header; Smart Add hidden; item detail Edit/Remove hidden; "Edit layout" + in-slot "+" hidden; but the space **opens**, contents render in list *and* layout, item detail opens read-only, and the List/Layout toggle works (FR-4, FR-5).
  4. On the card menu of a read-only space: Rename disabled/absent; **Delete works**. Delete the 3rd space → **badges clear** on the remaining 2 with no reload (FR-3, FR-6).
  5. **Re-upgrade to Pro** → every badge clears and every affordance returns **in the same session, no reload** (FR-7).
  6. **Regression:** on an editable (under-cap) space, add space at the cap, add a 7th zone, add past the item cap → the correct paywall (`spaces`/`zones`/`items`) still opens and still blocks; the locked "New space" tile + at-limit banner unchanged (FR-8).
  - 🔒 blocked by: T1–T10

---

## 2. 🔒 Security Considerations

- **Client-side gate is not enforcement.** 🟠 High. This item hides/disables affordances in the SPA only; a user holding the JWT can still mutate an over-cap space via direct API calls (rename, add item/zone). The product rule and CLAUDE.md's downgrade promise imply server-side enforcement, which is explicitly **out of scope here** and tracked separately.
  - [ ] Keep the framing "read-only in the UI" — don't imply server enforcement in badge copy or PR notes. Ensure a follow-up backlog item exists for server-side read-only enforcement (owner-scoped, in the mutating command handlers) before this is relied on for anything beyond UX honesty.
- **No new attack surface.** 🟢 Low. No new endpoint, auth path, DTO, or stored data — purely a derived boolean over existing session/plan state.
  - [ ] Confirm no read-only decision is persisted to `localStorage` or sent to the server (must stay a live `computed`, per FR-1).

## 3. 📈 Scalability / Correctness Considerations

- **Determinism is the whole feature.** The read-only set must select the *same* spaces on every render/session.
  - [ ] `readonlySpaceIds` slices `store.spaces` (server `OrderBy(s => s.Id)` order) — never a client re-sort or insertion-order artifact. Add a code comment stating this invariant.
- **Live re-derivation, never snapshot.**
  - [ ] Verify the flag is a `computed` (not a `ref` set on downgrade); confirm add/delete/upgrade all reflect immediately without a page reload (T13 steps 4–5).
- **Pro / unbounded cap.**
  - [ ] `isInf(cap)` returns an empty set before any slice — no space ever flagged on Pro (FR-7); `slice(Infinity)` is avoided by the early return.
- **Cost.** 🟢 Negligible — a `Set` over a handful of spaces recomputed on reactive change; no N+1, no extra fetch (FR-5 forbids one).

## 4. 📦 New Dependencies

No new dependencies required.

## 5. ❓ Open Questions

No blocking open questions. The three requirements-doc questions were resolved by the
human's accepted scope decisions: (1) **Duplicate** left clickable on a read-only card
(falls through to the existing `checkAddSpace` paywall); (2) badge is **informational
text** only, no upgrade CTA in Phase 1; (3) "stable order" is the **existing server
list order** (`OrderBy(s => s.Id)`), not most-recently-created.

Minor implementation decision (default chosen, not blocking): in layout mode the in-slot
"+" add chips are **hidden** when read-only (T8) rather than left visible-but-inert —
consistent with hiding Smart Add. Flag in review if the PM prefers a disabled-but-visible
treatment.
