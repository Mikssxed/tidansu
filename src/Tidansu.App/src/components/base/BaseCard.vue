<template>
    <component
        :is="as"
        :class="classes"
    >
        <slot />
    </component>
</template>

<script setup lang="ts">
    import { twMerge } from 'tailwind-merge';
    import { computed } from 'vue';

    interface BaseCardProps {
        /** Render element/component. */
        as?: string;
        /** surface-2 instead of the default surface. */
        raised?: boolean;
        /** Larger 20px radius used on landing/auth/pricing surfaces. */
        large?: boolean;
        /** Remove default inner padding (airy). */
        flush?: boolean;
    }

    const props = withDefaults(defineProps<BaseCardProps>(), {
        as: 'div',
        raised: false,
        large: false,
        flush: false,
    });

    const classes = computed(() =>
        twMerge(
            'border border-border',
            props.raised ? 'bg-surface-2' : 'bg-surface',
            props.large ? 'rounded-xl2' : 'rounded-card',
            props.flush ? '' : 'p-[calc(18px*var(--pad))]'
        )
    );
</script>
