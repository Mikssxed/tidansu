# Skill: Refactor Frontend Component

Use this to improve existing Vue components: extract logic, split into smaller components, enforce conventions.

---

## Common Refactoring Scenarios

### 1. Hardcoded hex colors → theme tokens

```vue
<!-- Before -->
<div style="background: rgba(59, 130, 246, 0.3)">

<!-- After -->
<div class="bg-info-500/30">
```

If the color doesn't exist as a theme token, add it to `style.css` under `@theme` first.

---

### 2. Raw CSS classes as props → variant prop pattern

**Before:**
```typescript
interface Props {
    bgColor: string;  // caller passes 'bg-blue-500' — bad
}
```

**After:**
```typescript
export type CardVariant = 'info' | 'success' | 'warning';

interface Props {
    variant: CardVariant;
}

const bgClasses: Record<CardVariant, string> = {
    info: 'bg-info-500/30',
    success: 'bg-success-500/30',
    warning: 'bg-warning-500/30',
};
```

---

### 3. Dynamic class interpolation → static Record map

```typescript
// Before — doesn't work with Tailwind v4
const cls = `bg-${props.color}-500`;

// After — static strings
const colorMap: Record<Variant, string> = {
    info: 'bg-info-500',
    error: 'bg-error-500',
};
```

---

### 4. Inline template expressions → computed properties

```vue
<!-- Before -->
<span>{{ Math.round((current / max) * 100) }}%</span>
<span>{{ items.filter(i => i.active).length }} active</span>

<!-- After -->
<span>{{ progressPercent }}</span>
<span>{{ activeCount }} active</span>
```

```typescript
const progressPercent = computed(() => `${Math.round((props.current / props.max) * 100)}%`);
const activeCount = computed(() => props.items.filter(i => i.active).length);
```

---

### 5. Large component → extract sub-components

If a component has more than ~3 visual sections, extract each into its own component.

**Before:** `DashboardView.vue` with 200 lines of mixed template sections.

**After:**
```
DashboardView.vue           ← composes feature components
DashboardHeader.vue         ← extracted
DashboardStatsGrid.vue      ← extracted
DashboardRecentActivity.vue ← extracted
```

Each extracted component:
- Gets its own variant/prop types
- Exports those types for the parent
- Remains focused on one visual concern

---

### 6. `any` types → proper interfaces

```typescript
// Before
const handleSubmit = async (data: any) => { ... };

// After
interface FormData {
    title: string;
    description: string;
    exp: number;
}
const handleSubmit = async (data: FormData) => { ... };
```

---

### 7. Missing type exports

If a parent component imports from a child without the child exporting its types, add exports:

```typescript
// Add to child component
export interface ChildItem {
    label: string;
    variant: CardVariant;
    value?: number;
}
```

---

## Refactoring Checklist

- [ ] All colors use theme tokens (no hex, no raw RGBA)
- [ ] Variant props use Record maps with complete static class strings
- [ ] No `any` types — all data shapes have interfaces
- [ ] Computed properties for all derived display values
- [ ] `twMerge()` used when accepting external `class` prop
- [ ] Types exported from child components, imported by parents
- [ ] Component does one visual thing (extract if not)
- [ ] No direct DOM manipulation — use Vue refs/reactivity
- [ ] No dynamic class interpolation
