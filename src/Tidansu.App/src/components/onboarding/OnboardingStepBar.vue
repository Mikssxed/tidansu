<template>
    <div class="flex items-center gap-2">
        <div
            v-for="seg in segments"
            :key="seg.n"
            class="h-1 flex-1 overflow-hidden rounded-chip bg-surface-3"
        >
            <div
                class="h-full rounded-chip bg-text transition-all duration-300"
                :style="seg.style"
            />
        </div>
        <span class="ml-2 shrink-0 text-[12px] text-text-3">{{ stepLabel }}</span>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    const props = defineProps<{ step: number }>();

    const segments = computed(() =>
        [1, 2, 3].map((n) => ({ n, style: { width: n <= props.step ? '100%' : '0%' } }))
    );
    const stepLabel = computed(() => `Step ${props.step} of 3`);
</script>
