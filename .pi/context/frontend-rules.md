# Frontend Rules

## Project Structure

```
src/Tidansu.App/src/
├── api/
│   ├── apiClient/              ← Kiota-generated client (never edit manually)
│   ├── BearerAuthenticationProvider.ts
│   └── index.ts
├── components/
│   ├── base/                   ← shared UI primitives (Button, Badge, Icon, etc.)
│   ├── form/                   ← form components (TextField, FormField)
│   ├── layout/                 ← SidebarLayout, AppLayout
│   ├── icons/                  ← SVG icon components
│   └── <feature>/              ← feature-specific components per domain area
├── composables/                ← useApiClient, useAuth, useForm, useNavigation
├── router/index.ts             ← route definitions
├── schemas/                    ← Zod validation schemas
├── stores/useAuthStore.ts      ← Pinia auth store
├── views/                      ← page-level components
├── types.ts                    ← app-wide TypeScript types
├── style.css                   ← Tailwind v4 + theme tokens
└── main.ts                     ← app entry point
```

---

## Component Conventions

### Script setup with TypeScript
Always use `<script setup lang="ts">`.

### Variant props — never raw CSS or hex
Define a `variant` (and optionally `size`) prop as a union type. Map variants to **complete static class strings** using `Record`:

```typescript
export type CardVariant = 'default' | 'info' | 'violet' | 'success';

interface CardProps {
    variant?: CardVariant;
    label: string;
    value: string;
}

const props = withDefaults(defineProps<CardProps>(), {
    variant: 'default',
});

const bgClasses: Record<CardVariant, string> = {
    default: 'bg-primary-900',
    info: 'bg-info-500/30',
    violet: 'bg-violet-500/30',
    success: 'bg-success-500/30',
};

const borderClasses: Record<CardVariant, string> = {
    default: 'border-primary-600',
    info: 'border-info-500',
    violet: 'border-violet-500',
    success: 'border-success-500',
};

const containerClass = computed(() =>
    twMerge('flex flex-col p-4 rounded-xl border', bgClasses[props.variant], borderClasses[props.variant])
);
```

### Export types from child components
Export variant/union types from child components so parents can reference them. **Do not** export interfaces that duplicate a Kiota-generated type — use the generated type directly instead.

```typescript
// CORRECT — export variant union for parent to use
export type CardVariant = 'info' | 'error' | 'success';

// WRONG — Quest duplicates TodayTaskItemDto fields; use TodayTaskItemDto directly
export interface Quest { title: string; xp: number; ... }
```

### Computed for derived values
Use `computed()` for any derived display value — strings, percentages, filtered arrays, mapped arrays. No logic in the template at all. If a `v-for` iterates over transformed data, compute the full mapped array first:

```typescript
// CORRECT — compute the full display array
const displayItems = computed(() =>
    validItems.value.map(item => ({
        occurrenceId: item.occurrenceId,
        title: item.title ?? '',
        completed: item.occurrenceStatus === TaskOccurrenceStatusObject.Done,
        // ...
    }))
);

// WRONG — logic inline in template
// v-for="item in items" :title="item.title ?? ''" :completed="item.status === 'Done'"
```

### No inline event-handler logic
Bind only a named function to event handlers. Arrow functions or expressions in the template are not allowed:

```typescript
// CORRECT
function handleToggle(id: string) { ... }
// <Component @toggle="handleToggle" />

// WRONG
// <Component @toggle="(id) => doSomething(id, items.find(...))" />
```

### twMerge for external class merging
Use `twMerge()` when a component accepts an external `class` prop that might conflict with internal classes:

```typescript
import { twMerge } from 'tailwind-merge';
const classes = computed(() => twMerge('base-classes', props.class));
```

### Static Tailwind classes only
Tailwind v4 scans statically. Dynamic interpolation does **not** work:

```typescript
// WRONG — class won't be generated
const cls = `bg-${props.color}-500`;

// CORRECT — full class string in Record map
const bgMap: Record<Variant, string> = {
    info: 'bg-info-500',
    error: 'bg-error-500',
};
```

---

## Color / Theme Rules

All colors are defined as tokens in `src/style.css` under `@theme`.

### Available semantic colors
- `error-500` — red/danger (#ef4444)
- `info-500` — blue (#3b82f6)
- `violet-500` — violet (#8b5cf6)
- `warning-500` — yellow (#eab308)
- `success-500` — green (#22c55e)
- `orange-500` — orange (#f97316)
- `accent-500` / `accent-700` — indigo
- `secondary-500` / `secondary-700` — purple
- `primary-900` / `primary-800` / `primary-600` / `primary-500` / `primary-400` / `primary-200`
- Dark bg variants: `orange-900`, `blue-900`, `green-900`, `purple-900`, `crimson-900`

### Opacity modifiers (preferred over RGBA)
```html
<!-- CORRECT -->
<div class="bg-info-500/30 border-b-violet-500/50">

<!-- WRONG — use theme tokens, not hex -->
<div style="background: rgba(59, 130, 246, 0.3)">
```

### Gradient utilities
```html
<div class="bg-gradient-purple">         <!-- indigo → purple -->
<div class="bg-gradient-midnight">       <!-- dark blue gradient -->
<span class="text-gradient-accent">      <!-- gradient text -->
```

### Never hardcode colors
Do not pass hex values as props or use them inline. Add new colors to `style.css @theme` first.

---

## View Conventions

- One view file per route, placed in `src/views/`
- Views compose feature components; they do not contain raw HTML UI elements
- Import types from child components using `import type`
- Use `as const` for variant literals in data arrays:

```typescript
const stats = [
    { label: 'Strength', value: 78, variant: 'error' as const },
    { label: 'Knowledge', value: 85, variant: 'info' as const },
];
```

---

## Routing Conventions

```typescript
// 1. Add view to AppViews map (lazy loaded)
export const AppViews = {
    myFeature: () => import('@/views/MyFeatureView.vue'),
    // ...
};

export type AppRouteNames = keyof typeof AppViews;

// 2. Register route using createRoute()
createRoute('/my-feature', 'myFeature', LayoutType.WITH_SIDEBAR, true)
// path, name (must match AppViews key), layoutType, requiresAuth
```

`LayoutType.WITH_SIDEBAR` — shows sidebar navigation.
`LayoutType.WITHOUT_SIDEBAR` — full-width layout (auth pages).

---

## API Client Usage

The Kiota client is a singleton factory. Never instantiate it directly:

```typescript
import { useApiClient } from '@/composables/useApiClient';

const apiClient = useApiClient();
const result = await apiClient.api.tasks.post(command);
```

After any backend endpoint change, regenerate the client:
```bash
npm run build:api   # from src/Tidansu.App
```

### Data fetching pattern — TanStack Query composables

Wrap Kiota calls in a feature composable using TanStack Query `useQuery` / `useMutation`. Mutations should invalidate relevant query keys on success:

```typescript
// src/composables/useFeatureName.ts
export function useFeatureName() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    const itemsQuery = useQuery({
        queryKey: ['feature', 'items'],
        queryFn: () => apiClient.api.feature.get(),
    });

    const createMutation = useMutation({
        mutationFn: (body: CreateFeatureCommand) => apiClient.api.feature.post(body),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feature'] }),
    });

    return {
        items: computed(() => itemsQuery.data.value ?? []),
        isLoading: computed(() => itemsQuery.isLoading.value),
        create: createMutation.mutate,
    };
}
```

### Enum display mapping

When an API enum needs to drive display values (label, emoji, variant), create a dedicated composable/utility — not inline logic in components:

```typescript
// src/composables/useAttributeDisplay.ts
import type { BaseAttribute } from '@/api/apiClient/models';

export function getAttributeDisplay(attribute: BaseAttribute | null | undefined) {
    const map: Record<BaseAttribute, { label: string; emoji: string; variant: QuestItemVariant }> = {
        Strength: { label: 'Strength', emoji: '💪', variant: 'error' },
        // ...
    };
    return map[attribute!] ?? { label: 'Unknown', emoji: '❓', variant: 'info' };
}
```

---

## State Management (Pinia)

Only `useAuthStore` exists currently. Pattern for new stores:

```typescript
export const useFeatureStore = defineStore('feature', () => {
    const items = ref<Item[]>([]);

    const count = computed(() => items.value.length);

    function addItem(item: Item) {
        items.value.push(item);
    }

    return { items, count, addItem };
});
```

- Use Composition API (function syntax), not Options API
- Persist sensitive data to `localStorage` manually (see `useAuthStore`)
- Use `computed()` for derived state

---

## TypeScript Rules

- **Never use `any`** — always define proper interfaces
- **Never duplicate Kiota types** — if `src/api/apiClient/models` already has the shape, use it directly as a prop type; do not re-declare it as a local interface
- **Kiota fields are nullable** — all generated fields are `T | null | undefined`. Narrow with typed computed using a type predicate before use:
  ```typescript
  const validItems = computed(() =>
      props.items.filter((i): i is TodayTaskItemDto & { occurrenceId: string } => !!i.occurrenceId)
  );
  ```
- **Enum comparisons use generated objects** — never compare against raw string literals; always use the generated const objects: `item.occurrenceStatus === TaskOccurrenceStatusObject.Done`, `item.attribute === BaseAttributeObject.Strength`
- Use `readonly` for props that should not be mutated
- Export component-specific variant/union types so parents can import them
- Use discriminated unions or union types for variant props
- Prefer `interface` for object shapes, `type` for unions

---

## Component File Location

| Type | Location |
|------|----------|
| Shared primitives | `src/components/base/` |
| Form inputs | `src/components/form/` |
| Layout wrappers | `src/components/layout/` |
| SVG icons | `src/components/icons/` |
| Feature components | `src/components/<feature>/` (e.g., `dashboard/`, `character/`) |
| Page views | `src/views/` |
| Auth views | `src/views/auth/` |

---

## Composables

| File | Purpose |
|------|---------|
| `useApiClient.ts` | Singleton Kiota client factory |
| `useAuth.ts` | Login/register/logout TanStack Query mutations |
| `useForm.ts` | Form submission handler with error integration |
| `useFormErrors.ts` | Field error tracking |
| `useNavigation.ts` | Navigation helper methods |

---

## Template purity (HARD RULE — no logic in `<template>`)

The template contains **no logic**. It may only use plain property/getter access,
structural directives (`v-if`/`v-for`/`v-show`), `v-model`, and **named event
handlers**. Everything that computes a value, a class, or a label goes in
`<script setup>` as a `computed`; everything that reacts to an event goes in a
named function.

Banned in the template (move each to `<script setup>`):

| Smell in template | Fix in script |
|---|---|
| `:style="{ width: pct + '%' }"` | `computed` returning the style object/string |
| `:class="on ? 'a' : 'b'"` | `computed` class |
| `:disabled="!valid"`, `x?.y ?? 0`, `!!target` | `computed` |
| `{{ fmt(value) }}`, `:title="label(o)"` | `computed` |
| `MAP[key]`, `arr[i].color` | `computed` |
| `@click="step = 2"` (assignment) | named handler `goToStep` |
| `@click="emit('open', id)"` (inline emit) | named handler that calls `emit` |
| `@click="() => do(x)"` (inline arrow) | named handler |

**`v-for` rule:** if rows need any derived value/class/state, build a fully
**mapped computed array** (each element already carries `label`, `meta`,
`classes`, `selected`, …) and iterate that. Never derive per-row in the template.

Allowed: `v-if="store.isPro"`, `:to="{ name: 'x' }"`, `v-model="email"`,
`@submit.prevent="onSubmit"`, `@click="selectType(s.id)"` (named handler that
takes a `v-for` loop argument is fine — it's wiring, not display logic).
