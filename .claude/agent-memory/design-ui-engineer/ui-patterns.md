---
name: ui-patterns
description: Non-obvious Tidansu frontend primitives/patterns — no toast system, modal composable, feature-flag module
metadata:
  type: project
---

Recurring Tidansu UI-system facts that aren't spelled out in CLAUDE.md /
frontend-rules.md:

- **No toast/notification system exists.** Transient user-visible messages
  (e.g. "billing unavailable") are surfaced by holding the message in a Pinia
  store ref and rendering an inline banner in the affected view(s). Pattern used
  in `useSessionStore.billingMessage` + banners in `PricingView`/`AccountView`.
  Banner style: `rounded-card border border-warn/40 bg-warn/10` with a `text-warn`
  icon for alerts; `border-pro/30 bg-pro/5` + `text-pro` for positive/info notices.

- **Modals:** `useModal()` (`src/composables/useModal.ts`) returns
  `{ isOpen (readonly ref), open, close }`. `BaseModal` takes `:open` (boolean) +
  `@close`, plus optional `maxWidth`/`dismissable`; content goes in the default
  slot. Bind `:open="modal.isOpen.value"` in the template.

- **Build/config feature flags** live in `src/config/featureFlags.ts`, each read
  once as `import.meta.env.VITE_* === 'true'` (default OFF when unset). Same shape
  as the `VITE_DISABLE_AUTH` route-guard bypass. Vite bundles them statically →
  flipping requires a rebuild. Document new dev flags (commented) in `.env.development`.

- **Base primitives** in `src/components/base/`: BaseButton (variant/size Records),
  BaseBadge, BaseIcon (names in `src/components/icons.ts` — e.g. `sparkle`, `lock`,
  `x`, `check`, `arrowL/arrowR`), BaseModal, BaseCard, BaseText, BaseProgressBar,
  BaseEmptyState, BasePopoverMenu. Reuse these before rolling new markup.

- **Plan/pricing data** is in `src/data/plans.ts` (`planOf(plan)`, `PLAN_FEATURES`,
  `isInf`). Prices/taglines are frontend-owned; enforced caps come from `/api/plans`.
