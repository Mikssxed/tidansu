<template>
    <div class="mt-6">
        <div class="flex flex-wrap items-center gap-3">
            <span class="text-[15px] font-bold text-text">Layout</span>
            <span class="rounded-chip border border-border bg-surface-2 px-2.5 py-1 text-[12px] text-text-2">
                {{ pillLabel }}
            </span>
            <div class="ml-auto flex rounded-ctrl border border-border bg-surface-2 p-0.5">
                <button
                    type="button"
                    class="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors"
                    :class="shelvesSegClass"
                    @click="setStyle('shelves')"
                >
                    <BaseIcon
                        name="list"
                        :size="14"
                    />
                    Shelves
                </button>
                <button
                    type="button"
                    class="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors"
                    :class="topSegClass"
                    @click="setStyle('top')"
                >
                    <BaseIcon
                        name="grid"
                        :size="14"
                    />
                    Top view
                </button>
            </div>
            <BaseButton
                v-if="!readOnly"
                variant="secondary"
                size="sm"
                @click="onEdit"
            >
                <BaseIcon
                    name="edit"
                    :size="16"
                />
                Edit layout
            </BaseButton>
        </div>

        <p class="mt-3 flex items-center gap-1.5 text-[12px] text-text-3">
            <BaseIcon
                :name="noteIcon"
                :size="13"
            />
            {{ noteText }}
        </p>

        <div class="mt-4">
            <ShelfElevation
                v-if="style === 'shelves'"
                :space="space"
                :selected-id="selectedId"
                :read-only="readOnly"
                @select="onSelect"
                @add="onAdd"
            />
            <LayoutTop
                v-else
                :space="space"
                :selected-id="selectedId"
                :read-only="readOnly"
                @select="onSelect"
                @add="onAdd"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
    import { BaseButton, BaseIcon } from '@/components/base';
    import LayoutTop from '@/components/space/layout/LayoutTop.vue';
    import ShelfElevation from '@/components/space/layout/ShelfElevation.vue';
    import type { ItemDepth, Space } from '@/data/types';
    import { computed, ref } from 'vue';

    interface Props {
        space: Space;
        selectedId: string | null;
        /** B-17: true on an over-cap space — hides "Edit layout" and in-slot "+" adds. */
        readOnly?: boolean;
    }

    const props = withDefaults(defineProps<Props>(), { readOnly: false });
    const emit = defineEmits<{
        select: [id: string];
        add: [payload: { zoneId: string; depth: ItemDepth; level: number }];
        edit: [];
    }>();

    const style = ref<'shelves' | 'top'>('shelves');

    const pillLabel = computed(() => {
        const free = props.space.canvasMode === 'freeform';
        const layout = free
            ? 'free canvas'
            : props.space.layoutColumns > 1
              ? `${props.space.layoutColumns} columns`
              : 'single column';
        return `${layout} · ${props.space.items.length} items`;
    });

    const shelvesSegClass = computed(() =>
        style.value === 'shelves' ? 'bg-surface-3 text-text' : 'text-text-2 hover:text-text'
    );
    const topSegClass = computed(() =>
        style.value === 'top' ? 'bg-surface-3 text-text' : 'text-text-2 hover:text-text'
    );

    const noteIcon = computed(() => (style.value === 'shelves' ? 'list' : 'grid'));
    const noteText = computed(() =>
        style.value === 'shelves'
            ? 'Open the door and look in — units grouped by wall, each shelf level stacked top to bottom. Items flow; no fixed slot count.'
            : 'Looking down — the same map you drew. Levels stack vertically (hidden from the top); depth shows as front / back bands.'
    );

    function setStyle(value: 'shelves' | 'top') {
        style.value = value;
    }
    function onSelect(id: string) {
        emit('select', id);
    }
    function onAdd(payload: { zoneId: string; depth: ItemDepth; level: number }) {
        emit('add', payload);
    }
    function onEdit() {
        emit('edit');
    }
</script>
