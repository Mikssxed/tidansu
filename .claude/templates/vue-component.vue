<!-- Template: Vue Component (base or feature)
     Location: src/components/base/{ComponentName}.vue
             or src/components/{feature}/{ComponentName}.vue
     Replace {Component}, {Variant} placeholders -->

<script setup lang="ts">
import { computed } from 'vue';
import { twMerge } from 'tailwind-merge';

// 1. Export types so parent components can reference them with `import type`
export type {Component}Variant = 'default' | 'info' | 'success' | 'warning' | 'error';

// 2. Props interface — never use `any`
interface {Component}Props {
    variant?: {Component}Variant;
    label: string;
    value?: string | number;
    // Add more props as needed
}

// 3. Set defaults using withDefaults
const props = withDefaults(defineProps<{Component}Props>(), {
    variant: 'default',
});

// 4. Emit events (remove if not needed)
const emit = defineEmits<{
    click: [];
}>();

// 5. Variant → static class maps (one Record per visual aspect)
// IMPORTANT: Use COMPLETE static strings — no dynamic interpolation
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

// 6. Computed class strings — use twMerge to prevent class conflicts
const containerClass = computed(() =>
    twMerge(
        'flex flex-col gap-2 p-4 rounded-xl',
        bgClasses[props.variant]
    )
);

const labelClass = computed(() =>
    twMerge('text-sm font-medium', textClasses[props.variant])
);
</script>

<template>
    <div :class="containerClass" @click="emit('click')">
        <span :class="labelClass">{{ label }}</span>
        <span v-if="value !== undefined" class="text-2xl font-bold text-white">
            {{ value }}
        </span>
        <!-- Slot for custom content -->
        <slot />
    </div>
</template>
