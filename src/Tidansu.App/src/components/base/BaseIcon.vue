<template>
    <svg
        :width="size"
        :height="size"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        :stroke-width="stroke"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        <path :d="d" />
    </svg>
</template>

<script setup lang="ts">
    import { ICON_PATHS, type IconName } from '@/components/icons';
    import { computed } from 'vue';

    interface BaseIconProps {
        name: IconName;
        size?: number | string;
        stroke?: number | string;
    }

    const props = withDefaults(defineProps<BaseIconProps>(), {
        size: 20,
        stroke: 2,
    });

    const d = computed(() => ICON_PATHS[props.name] ?? ICON_PATHS.package);
</script>
