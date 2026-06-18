<template>
    <button
        type="button"
        role="menuitem"
        :class="classes"
    >
        <BaseIcon
            v-if="icon"
            :name="icon"
            :size="16"
        />
        <slot />
    </button>
</template>

<script setup lang="ts">
    import BaseIcon from '@/components/base/BaseIcon.vue';
    import type { IconName } from '@/components/icons';
    import { twMerge } from 'tailwind-merge';
    import { computed } from 'vue';

    interface Props {
        icon?: IconName;
        danger?: boolean;
    }

    const props = defineProps<Props>();

    const classes = computed(() =>
        twMerge(
            'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] transition-colors',
            props.danger
                ? 'text-danger hover:bg-danger/10'
                : 'text-text-2 hover:bg-surface-3 hover:text-text'
        )
    );
</script>
