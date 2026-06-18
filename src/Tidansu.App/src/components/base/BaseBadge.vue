<template>
    <span :class="classes">
        <slot />
    </span>
</template>

<script setup lang="ts">
    import { twMerge } from 'tailwind-merge';
    import { computed } from 'vue';

    export type BadgeVariant = 'neutral' | 'pro' | 'warn' | 'danger' | 'ok';

    interface BaseBadgeProps {
        variant?: BadgeVariant;
    }

    const props = withDefaults(defineProps<BaseBadgeProps>(), {
        variant: 'neutral',
    });

    const variantClasses: Record<BadgeVariant, string> = {
        neutral: 'bg-surface-2 text-text-2 border-border',
        pro: 'bg-pro/15 text-pro border-pro/30',
        warn: 'bg-warn/15 text-warn border-warn/30',
        danger: 'bg-danger/15 text-danger border-danger/30',
        ok: 'bg-ok/15 text-ok border-ok/30',
    };

    const classes = computed(() =>
        twMerge(
            'inline-flex items-center gap-1 rounded-chip border px-2.5 py-1 text-[12px] font-semibold',
            variantClasses[props.variant]
        )
    );
</script>
