<template>
    <button
        type="button"
        class="inline-flex max-w-full items-center gap-1.5 rounded-chip border px-2.5 py-1 text-[12px] transition-colors"
        :class="chipClass"
        :title="title"
        @click="onClick"
    >
        <BaseIcon
            :name="iconName"
            :size="iconSize"
            class="shrink-0"
        />
        <span class="truncate">{{ item.name }}</span>
        <span
            v-if="showQty"
            class="shrink-0 text-text-3"
        >
            {{ qtyLabel }}
        </span>
        <span
            v-if="warn"
            class="size-1.5 shrink-0 rounded-chip bg-warn"
        />
    </button>
</template>

<script setup lang="ts">
    import { BaseIcon } from '@/components/base';
    import { itemIcon } from '@/components/icons';
    import { expiryStatus } from '@/data/dates';
    import type { Item } from '@/data/types';
    import { computed } from 'vue';

    interface Props {
        item: Item;
        selectedId: string | null;
        size?: 'sm' | 'md';
    }

    const props = withDefaults(defineProps<Props>(), { size: 'md' });
    const emit = defineEmits<{ select: [id: string] }>();

    const iconName = computed(() => props.item.icon ?? itemIcon(props.item.name));
    const iconSize = computed(() => (props.size === 'sm' ? 13 : 15));
    const showQty = computed(() => props.item.quantity > 1);
    const qtyLabel = computed(() => `×${props.item.quantity}`);

    const warn = computed(() => {
        const s = expiryStatus(props.item.expiry);
        return s === 'soon' || s === 'today' || s === 'gone';
    });

    const selected = computed(() => props.item.id === props.selectedId);
    const chipClass = computed(() => {
        if (selected.value) return 'border-text bg-surface-3 text-text';
        if (warn.value) return 'border-warn/40 bg-surface-2 text-text';
        return 'border-border bg-surface-2 text-text-2 hover:border-border-strong hover:text-text';
    });

    const title = computed(() =>
        props.item.quantity > 1 ? `${props.item.name} ×${props.item.quantity}` : props.item.name
    );

    function onClick() {
        emit('select', props.item.id);
    }
</script>
