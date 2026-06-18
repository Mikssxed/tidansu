<template>
    <span
        v-if="status"
        class="inline-flex items-center gap-1 text-[12px] font-medium"
        :class="colorClass"
    >
        <span class="size-1.5 rounded-chip bg-current" />
        {{ text }}
    </span>
</template>

<script setup lang="ts">
    import { expiryTextClasses } from '@/composables/useColorVariant';
    import { expiryLabel, expiryStatus } from '@/data/dates';
    import { computed } from 'vue';

    const props = defineProps<{ iso: string | null }>();

    const status = computed(() => expiryStatus(props.iso));
    const colorClass = computed(() => (status.value ? expiryTextClasses[status.value] : ''));
    const text = computed(() => {
        const s = status.value;
        if (!s) return '';
        const label = expiryLabel(props.iso);
        if (s === 'gone') return `expired ${label}`;
        if (s === 'today') return 'expires today';
        return `expires ${label}`;
    });
</script>
