# Skill: Create Frontend Component

Use this to create a new Vue component — either a shared base primitive or a feature-specific component.

> **Grounding:** copy a real base primitive — `BaseBadge.vue` or `BaseButton.vue`
> — for the exact variant/token convention (see `.claude/context/patterns.md`).
> **Use the real theme tokens** (from `style.css @theme`): surfaces `bg` /
> `surface` / `surface-2` / `surface-3`; text `text` / `text-2` / `text-3`;
> borders `border` / `border-faint` / `border-strong`; semantic `warn` / `danger` /
> `ok` / `pro`; primary `pri-bg` / `pri-fg`; zones `zone-amber|blue|gray|green|pink`;
> radii `rounded-ctrl` / `rounded-chip` / `rounded-card`. **The `info-500` /
> `primary-900` / `success-500` tokens in older examples do NOT exist** — they were
> SelfGrind tokens and produce no CSS.

---

## Decide: Base or Feature Component?

| Base component | Feature component |
|---------------|-------------------|
| Pure UI, no domain logic | Domain-specific presentation |
| `src/components/base/` | `src/components/{feature}/` |
| Examples: BaseButton, BaseBadge, BaseCard, BaseIcon | Examples: SpaceCard, ItemRow, UsageMeter |
| No domain imports | May import base components |
| Exported variant types used widely | Exported types used by parent view/feature |

---

## Component Template

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { twMerge } from 'tailwind-merge';

// 1. Export types so parent components can reference them
export type {Component}Variant = 'neutral' | 'pro' | 'warn' | 'danger' | 'ok';

// 2. Define props interface — never use `any`
interface {Component}Props {
    variant?: {Component}Variant;
    label: string;
    value?: string | number;
    // Add other props
}

// 3. Set defaults
const props = withDefaults(defineProps<{Component}Props>(), {
    variant: 'neutral',
});

// 4. Map variants to COMPLETE static class strings using REAL @theme tokens
//    (never dynamic interpolation, never hex, never info-500/primary-900)
const variantClasses: Record<{Component}Variant, string> = {
    neutral: 'bg-surface-2 text-text-2 border-border',
    pro: 'bg-pro/15 text-pro border-pro/30',
    warn: 'bg-warn/15 text-warn border-warn/30',
    danger: 'bg-danger/15 text-danger border-danger/30',
    ok: 'bg-ok/15 text-ok border-ok/30',
};

// 5. Use computed() for derived class strings — use twMerge() to merge safely
const containerClass = computed(() =>
    twMerge('flex flex-col gap-1 p-4 rounded-card border', variantClasses[props.variant])
);
</script>

<template>
    <div :class="containerClass">
        <span class="text-sm font-medium">{{ label }}</span>
        <span v-if="value" class="text-2xl font-bold text-text">{{ value }}</span>
        <!-- Use <slot> for content projection -->
        <slot />
    </div>
</template>
```

---

## Color Rules

Use theme tokens only — **never hardcode hex, never use SelfGrind `*-500` tokens**:

```typescript
// CORRECT — real @theme tokens with opacity modifiers
const bgMap = {
    warn: 'bg-warn/15',
    danger: 'bg-danger/15',
};

// WRONG — hardcoded hex is forbidden
const bgMap = { warn: 'bg-[#eab308]/30' };

// WRONG — these tokens do not exist in style.css (produce no CSS)
const bgMap = { info: 'bg-info-500/30', default: 'bg-primary-900' };
```

Available token classes (from `style.css @theme`): `bg-bg`, `bg-surface`,
`bg-surface-2`, `bg-surface-3`, `text-text`, `text-text-2`, `text-text-3`,
`text-warn`, `text-danger`, `text-ok`, `text-pro`, `border-border`,
`border-border-strong`, `bg-pri-bg`, `text-pri-fg`,
`bg-zone-blue` / `zone-green` / `zone-amber` / `zone-pink` / `zone-gray`.

---

## Multiple Variant Maps

For components that need different color aspects per variant:

```typescript
const bgClasses: Record<Variant, string> = {
    warn: 'bg-warn/15',
    ok: 'bg-ok/15',
};

const borderClasses: Record<Variant, string> = {
    warn: 'border-b-warn',
    ok: 'border-b-ok',
};

const iconClasses: Record<Variant, string> = {
    warn: 'text-warn',
    ok: 'text-ok',
};

const containerClass = computed(() =>
    twMerge(
        'flex items-center gap-3 p-4 rounded-card border-b-4',
        bgClasses[props.variant],
        borderClasses[props.variant]
    )
);
```

---

## Slots

Use `<slot>` for content projection:

```vue
<template>
    <div :class="containerClass">
        <slot name="header" />
        <slot />
        <slot name="footer" />
    </div>
</template>
```

---

## Emitting Events

```typescript
const emit = defineEmits<{
    click: [id: string];
    change: [value: number];
}>();

function handleClick() {
    emit('click', props.id);
}
```

---

## Accepting External Classes (twMerge pattern)

For components that should accept a `class` prop:

```typescript
interface Props {
    class?: string;
}
const props = defineProps<Props>();

const containerClass = computed(() =>
    twMerge('internal-base-classes', props.class)
);
```

---

## No Dynamic Class Interpolation

Tailwind v4 uses static scanning:

```typescript
// WRONG — class won't be in CSS bundle
const cls = `text-${props.color}`;

// CORRECT — full static string in Record
const colorMap: Record<Variant, string> = {
    warn: 'text-warn',
    danger: 'text-danger',
};
```
