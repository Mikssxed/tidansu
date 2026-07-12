---
name: create-frontend-view
description: Add a new page/view to Tidansu's Vue 3 frontend. Use when adding a route with its view component.
---

# Skill: Create Frontend View

Use this to add a new page/view to the Vue frontend.

---

## Step 1 — Create the View File

Create `src/Tidansu.App/src/views/{FeatureName}View.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import Feature{Component} from '@/components/{feature}/Feature{Component}.vue';
import type { {ComponentType} } from '@/components/{feature}/Feature{Component}.vue';

// Props (if this view receives route params as props)
const props = defineProps<{
    id?: string;
}>();

// Data for feature components — use typed arrays with as const for variants
const items: {ComponentType}[] = [
    { label: 'Example', variant: 'info' as const },
];

// Computed values for derived display data
const itemCount = computed(() => items.length);
</script>

<template>
    <div class="flex flex-col gap-6 p-4 md:p-8 flex-1 max-h-screen overflow-y-auto">
        <!-- Compose feature components — no raw HTML elements for UI -->
        <Feature{Component}
            v-for="item in items"
            :key="item.label"
            v-bind="item"
        />
    </div>
</template>
```

---

## Step 2 — Register in Router

In `src/Tidansu.App/src/router/index.ts`:

### Add to AppViews map
```typescript
export const AppViews = {
    // ... existing views
    {featureName}: () => import('@/views/{FeatureName}View.vue'),
};
```

The key must match the route `name`. Use camelCase.

### Add route using createRoute()
```typescript
createRoute('/{feature-path}', '{featureName}', LayoutType.WITH_SIDEBAR, true),
// args: path, name (AppViews key), layoutType, requiresAuth
```

Use `LayoutType.WITHOUT_SIDEBAR` for auth pages (login, register).
Use `requiresAuth = false` for public pages.

---

## Step 3 — Add to Sidebar (if applicable)

If the new view should appear in the sidebar navigation, update `SidebarLayout.vue` to include a nav link:

```vue
<SidebarNavItem
    :to="{ name: '{featureName}' }"
    label="{Feature Name}"
    icon="{icon-name}"
/>
```

---

## View Conventions

- Views compose **feature components** — they should not contain direct UI markup (divs styled as cards, etc.)
- Pass typed data down as props to feature components
- Use `import type { SomeType }` from child components to type your data arrays
- Use `as const` for variant literals to preserve literal types:
  ```typescript
  const stats = [
      { value: 42, variant: 'info' as const },
  ];
  ```
- Use `computed()` for derived values — never inline expressions in template
- Views manage layout (flex, grid, padding) — feature components manage their own internal layout

---

## Route with Props (dynamic param)

If the view needs a route param (e.g., `/tasks/:id`):

```typescript
// router/index.ts
createRoute('/tasks/:id', 'taskDetail', LayoutType.WITH_SIDEBAR, true, true)
// Last `true` enables props: true (route params passed as props)
```

```vue
<!-- TaskDetailView.vue -->
<script setup lang="ts">
const props = defineProps<{
    id: string;
}>();
</script>
```
