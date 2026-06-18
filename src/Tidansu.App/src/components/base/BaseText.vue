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

    export type TextTone = 'default' | 'muted' | 'faint';

    interface BaseTextProps {
        as?: string;
        tone?: TextTone;
    }

    const props = withDefaults(defineProps<BaseTextProps>(), {
        as: 'p',
        tone: 'default',
    });

    const toneClasses: Record<TextTone, string> = {
        default: 'text-text',
        muted: 'text-text-2',
        faint: 'text-text-3',
    };

    const classes = computed(() => twMerge('text-[14px] leading-relaxed', toneClasses[props.tone]));
</script>
