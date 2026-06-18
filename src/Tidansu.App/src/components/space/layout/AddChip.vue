<template>
    <button
        type="button"
        class="inline-flex items-center gap-1 rounded-chip border border-dashed border-border-strong px-2.5 py-1 text-[12px] text-text-3 transition-colors hover:border-text-3 hover:text-text"
        title="Add an item here"
        @click="onClick"
    >
        <BaseIcon
            name="plus"
            :size="14"
        />
        <span v-if="label">{{ label }}</span>
    </button>
</template>

<script setup lang="ts">
    import { BaseIcon } from '@/components/base';

    withDefaults(defineProps<{ label?: string }>(), { label: 'Add' });
    const emit = defineEmits<{ add: [] }>();

    function onClick() {
        emit('add');
    }
</script>
