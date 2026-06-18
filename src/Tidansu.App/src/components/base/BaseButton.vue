<template>
    <button
        :class="classes"
        :disabled="disabled"
        :type="type"
    >
        <slot />
    </button>
</template>

<script setup lang="ts">
    import { twMerge } from 'tailwind-merge';
    import { computed } from 'vue';

    export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
    export type ButtonSize = 'sm' | 'md';

    interface BaseButtonProps {
        variant?: ButtonVariant;
        size?: ButtonSize;
        disabled?: boolean;
        type?: 'button' | 'submit' | 'reset';
    }

    const props = withDefaults(defineProps<BaseButtonProps>(), {
        variant: 'primary',
        size: 'md',
        disabled: false,
        type: 'button',
    });

    const sizeClasses: Record<ButtonSize, string> = {
        sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-ctrl',
        md: 'h-11 px-4 text-[15px] gap-2 rounded-ctrl',
    };

    const variantClasses: Record<ButtonVariant, string> = {
        primary: 'bg-pri-bg text-pri-fg hover:opacity-90',
        secondary:
            'bg-surface-2 text-text border border-border hover:bg-surface-3',
        ghost: 'bg-transparent text-text-2 hover:bg-surface-2 hover:text-text',
        danger: 'bg-danger text-pri-fg hover:opacity-90',
    };

    const classes = computed(() =>
        twMerge(
            'inline-flex items-center justify-center font-semibold cursor-pointer transition-[opacity,background-color] duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
            sizeClasses[props.size],
            variantClasses[props.variant]
        )
    );
</script>
