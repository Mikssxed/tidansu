<template>
    <Teleport to="body">
        <div
            :class="classes"
            role="alert"
        >
            <BaseIcon
                name="alert"
                :size="16"
                :class="iconClasses"
            />
            <p class="flex-1 text-[14px] text-text">{{ message }}</p>
            <button
                type="button"
                class="shrink-0 text-text-3 transition-colors hover:text-text"
                aria-label="Dismiss message"
                @click="onDismiss"
            >
                <BaseIcon
                    name="x"
                    :size="15"
                />
            </button>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
    import { twMerge } from 'tailwind-merge';
    import { computed, onMounted, onUnmounted } from 'vue';
    import BaseIcon from './BaseIcon.vue';

    export type ToastVariant = 'warn' | 'danger';

    interface BaseToastProps {
        message: string;
        variant?: ToastVariant;
        duration?: number;
    }

    const props = withDefaults(defineProps<BaseToastProps>(), {
        variant: 'warn',
        duration: 6000,
    });

    const emit = defineEmits<{ dismiss: [] }>();

    /**
     * Base + variant must go through a single `twMerge` into one `:class` (review M2).
     * Splitting them across a static `class` and a bound `:class` puts two background
     * utilities on the element — `twMerge` cannot see across the two attributes, so the
     * variant tint would win only by declaration order in `style.css`.
     */
    const BASE_CLASSES =
        'fixed bottom-6 left-1/2 z-40 flex w-full max-w-[440px] -translate-x-1/2 items-start gap-2.5 rounded-card border bg-surface-2 px-4 py-3 shadow-lg';

    const variantClasses: Record<ToastVariant, string> = {
        warn: 'border-warn/40 bg-warn/10',
        danger: 'border-danger/40 bg-danger/10',
    };

    const iconVariantClasses: Record<ToastVariant, string> = {
        warn: 'text-warn',
        danger: 'text-danger',
    };

    const classes = computed(() => twMerge(BASE_CLASSES, variantClasses[props.variant]));

    const iconClasses = computed(() =>
        twMerge('mt-0.5 shrink-0', iconVariantClasses[props.variant])
    );

    function onDismiss(): void {
        emit('dismiss');
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    onMounted(() => {
        timer = setTimeout(onDismiss, props.duration);
    });

    onUnmounted(() => {
        if (timer) clearTimeout(timer);
    });
</script>
