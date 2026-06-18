<template>
    <div
        class="h-1.5 w-full overflow-hidden rounded-chip bg-surface-3"
        role="progressbar"
        :aria-valuenow="value"
        :aria-valuemin="0"
        :aria-valuemax="max"
    >
        <div
            class="h-full rounded-chip transition-[width] duration-300"
            :class="barClass"
            :style="barStyle"
        />
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    interface BaseProgressBarProps {
        value: number;
        max: number;
        /** Turn the bar warning-colored when at/over the cap. */
        warnAtCap?: boolean;
    }

    const props = withDefaults(defineProps<BaseProgressBarProps>(), {
        warnAtCap: true,
    });

    const pct = computed(() => {
        if (!isFinite(props.max) || props.max <= 0) return 0;
        return Math.min(100, Math.round((props.value / props.max) * 100));
    });

    const barStyle = computed(() => ({ width: `${pct.value}%` }));

    const atCap = computed(() => isFinite(props.max) && props.value >= props.max);

    const barClass = computed(() => (props.warnAtCap && atCap.value ? 'bg-warn' : 'bg-text-2'));
</script>
