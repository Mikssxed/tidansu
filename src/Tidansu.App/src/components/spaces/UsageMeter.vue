<template>
    <div>
        <div class="mb-1.5 flex items-baseline justify-between gap-3">
            <span class="text-[13px] font-medium text-text-2">{{ label }}</span>
            <span
                class="text-[12px] tabular-nums"
                :class="valueClass"
            >
                {{ valueLabel }}
            </span>
        </div>
        <BaseProgressBar
            v-if="!unlimited"
            :value="used"
            :max="cap"
        />
        <div
            v-else
            class="h-1.5 w-full rounded-chip bg-surface-3"
        />
    </div>
</template>

<script setup lang="ts">
    import { BaseProgressBar } from '@/components/base';
    import { isInf } from '@/data/plans';
    import { computed } from 'vue';

    interface UsageMeterProps {
        label: string;
        used: number;
        cap: number;
    }

    const props = defineProps<UsageMeterProps>();

    const unlimited = computed(() => isInf(props.cap));
    const atCap = computed(() => !unlimited.value && props.used >= props.cap);
    const valueClass = computed(() => (atCap.value ? 'text-warn' : 'text-text-3'));
    const valueLabel = computed(() =>
        unlimited.value ? `${props.used} · Unlimited` : `${props.used} of ${props.cap}`
    );
</script>
