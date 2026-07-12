<!-- Template: Frontend View
     Location: src/views/{FeatureName}View.vue
     Register in router/index.ts via AppViews + createRoute()
     Replace {Feature}, {feature}, {Component} placeholders -->

<script setup lang="ts">
import { computed, ref } from 'vue';

// Import feature components (not base components directly in views)
import {Feature}{Component} from '@/components/{feature}/{Feature}{Component}.vue';

// Import types from child components so data arrays are typed correctly
import type { {Component}Variant } from '@/components/{feature}/{Feature}{Component}.vue';

// Route props (only add if route has `props: true` and dynamic segments)
// const props = defineProps<{ id?: string }>();

// Define the shape of data passed to feature components
interface {Component}Item {
    label: string;
    value: number;
    variant: {Component}Variant;
}

// Typed data — use `as const` for variant literals to preserve literal types
const items: {Component}Item[] = [
    { label: 'Example One', value: 42, variant: 'info' as const },
    { label: 'Example Two', value: 87, variant: 'success' as const },
];

// Reactive state (add as needed)
const isLoading = ref(false);

// Computed derived values — never inline in template
const itemCount = computed(() => items.length);
const hasItems = computed(() => items.length > 0);
</script>

<template>
    <!-- Views handle layout: padding, scroll, flex/grid -->
    <div class="flex flex-col gap-6 p-4 md:p-8 flex-1 max-h-screen overflow-y-auto">

        <!-- Compose feature components — no raw UI markup in views -->
        <{Feature}{Component}
            v-for="item in items"
            :key="item.label"
            :label="item.label"
            :value="item.value"
            :variant="item.variant"
        />

        <!-- Empty state -->
        <div v-if="!hasItems" class="text-center text-primary-400 py-8">
            No items yet.
        </div>

    </div>
</template>
