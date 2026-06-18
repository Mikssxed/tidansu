# Skill: Create Frontend Component

Use this to create a new Vue component — either a shared base primitive or a feature-specific component.

---

## Decide: Base or Feature Component?

| Base component | Feature component |
|---------------|-------------------|
| Pure UI, no domain logic | Domain-specific presentation |
| `src/components/base/` | `src/components/{feature}/` |
| Examples: Button, Badge, Card, Icon | Examples: TaskCard, CharacterStats, DailyHabit |
| No domain imports | May import base components |
| Exported variant types used widely | Exported types used by parent view/feature |

---

## Component Template

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { twMerge } from 'tailwind-merge';

// 1. Export types so parent components can reference them
export type {Component}Variant = 'default' | 'info' | 'success' | 'warning' | 'error';

// 2. Define props interface — never use `any`
interface {Component}Props {
    variant?: {Component}Variant;
    label: string;
    value?: string | number;
    // Add other props
}

// 3. Set defaults
const props = withDefaults(defineProps<{Component}Props>(), {
    variant: 'default',
});

// 4. Map variants to COMPLETE static class strings (never dynamic interpolation)
const bgClasses: Record<{Component}Variant, string> = {
    default: 'bg-primary-900',
    info: 'bg-info-500/30',
    success: 'bg-success-500/30',
    warning: 'bg-warning-500/30',
    error: 'bg-error-500/30',
};

const textClasses: Record<{Component}Variant, string> = {
    default: 'text-primary-200',
    info: 'text-info-500',
    success: 'text-success-500',
    warning: 'text-warning-500',
    error: 'text-error-500',
};

// 5. Use computed() for derived class strings — use twMerge() to merge safely
const containerClass = computed(() =>
    twMerge('flex flex-col p-4 rounded-xl', bgClasses[props.variant])
);

const labelClass = computed(() =>
    twMerge('text-sm font-medium', textClasses[props.variant])
);
</script>

<template>
    <div :class="containerClass">
        <span :class="labelClass">{{ label }}</span>
        <span v-if="value" class="text-2xl font-bold text-white">{{ value }}</span>
        <!-- Use <slot> for content projection -->
        <slot />
    </div>
</template>
```

---

## Color Rules

Use theme tokens only — **never hardcode hex values**:

```typescript
// CORRECT
const bgMap = {
    info: 'bg-info-500/30',      // Opacity modifier
    error: 'bg-error-500/30',
};

// WRONG
const bgMap = {
    info: 'bg-[#3b82f6]/30',     // Hardcoded hex — forbidden
};
```

Available token classes: `bg-info-500`, `bg-error-500`, `bg-success-500`, `bg-warning-500`, `bg-violet-500`, `bg-accent-500`, `bg-primary-900`, etc.

---

## Multiple Variant Maps

For components that need different color aspects per variant:

```typescript
const bgClasses: Record<Variant, string> = {
    info: 'bg-info-900/40',
    success: 'bg-success-900/40',
};

const borderClasses: Record<Variant, string> = {
    info: 'border-b-info-500',
    success: 'border-b-success-500',
};

const iconClasses: Record<Variant, string> = {
    info: 'text-info-500',
    success: 'text-success-500',
};

const containerClass = computed(() =>
    twMerge(
        'flex items-center gap-3 p-4 rounded-xl border-b-4',
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
const cls = `text-${props.color}-500`;

// CORRECT — full static string in Record
const colorMap: Record<Variant, string> = {
    info: 'text-info-500',
    error: 'text-error-500',
};
```
