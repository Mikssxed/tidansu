<template>
    <div class="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div
            class="mb-4 flex size-14 items-center justify-center rounded-card border border-border bg-surface-2 text-text-2"
        >
            <BaseIcon
                :name="icon"
                :size="26"
            />
        </div>
        <h2 class="text-[19px] font-bold text-text">{{ title }}</h2>
        <p
            v-if="description"
            class="mt-1.5 max-w-sm text-[14px] text-text-2"
        >
            {{ description }}
        </p>
        <div
            v-if="$slots.action"
            class="mt-5"
        >
            <slot name="action" />
        </div>
    </div>
</template>

<script setup lang="ts">
    import BaseIcon from '@/components/base/BaseIcon.vue';
    import type { IconName } from '@/components/icons';

    interface BaseEmptyStateProps {
        icon: IconName;
        title: string;
        description?: string;
    }

    defineProps<BaseEmptyStateProps>();
</script>
