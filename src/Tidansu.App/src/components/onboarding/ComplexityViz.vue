<template>
    <div
        class="flex size-14 shrink-0 gap-1 rounded-ctrl border border-border bg-surface p-1.5"
        :class="boxClass"
    >
        <template v-if="viz === 'rows'">
            <i
                v-for="n in 3"
                :key="n"
                class="flex-1 rounded-[3px] bg-surface-3"
            />
        </template>
        <template v-else-if="viz === 'cols'">
            <i class="flex-1 rounded-[3px] bg-surface-3" />
            <i class="flex-1 rounded-[3px] bg-surface-3" />
        </template>
        <template v-else>
            <i class="flex-[2] self-start rounded-[3px] bg-surface-3" style="height: 60%" />
            <i class="flex-1 self-end rounded-[3px] bg-surface-3" style="height: 75%" />
        </template>
    </div>
</template>

<script setup lang="ts">
    import type { ComplexityViz } from '@/data/onboarding';
    import { computed } from 'vue';

    const props = defineProps<{ viz: ComplexityViz }>();

    const boxClass = computed(() =>
        props.viz === 'rows' ? 'flex-col' : 'flex-row items-stretch'
    );
</script>
