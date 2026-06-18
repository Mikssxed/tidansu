<template>
    <div class="flex gap-4 overflow-x-auto">
        <div
            v-for="col in columns"
            :key="col.index"
            class="flex min-w-[220px] flex-1 flex-col gap-2"
        >
            <div
                v-if="showHeaders"
                class="text-[12px] font-semibold uppercase tracking-[0.06em] text-text-3"
            >
                {{ col.label }}
            </div>
            <button
                v-for="zone in col.zones"
                :key="zone.id"
                type="button"
                class="flex items-center gap-2.5 rounded-ctrl border bg-surface p-3 text-left transition-colors"
                :class="zone.btnClass"
                @click="selectZone(zone.id)"
            >
                <span
                    class="size-2.5 shrink-0 rounded-[3px]"
                    :class="zone.accentClass"
                />
                <span class="min-w-0 flex-1">
                    <span class="block truncate text-[14px] font-semibold text-text">{{ zone.name }}</span>
                    <span class="block truncate text-[12px] text-text-3">{{ zone.meta }}</span>
                </span>
                <span class="text-[13px] tabular-nums text-text-3">{{ zone.count }}</span>
            </button>
            <button
                type="button"
                class="flex items-center justify-center gap-1.5 rounded-ctrl border border-dashed border-border-strong py-2.5 text-[13px] text-text-2 transition-colors hover:border-text-3 hover:text-text"
                @click="addZone(col.index)"
            >
                <BaseIcon
                    name="plus"
                    :size="15"
                />
                Add shelf
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { BaseIcon } from '@/components/base';
    import { zoneBgClasses } from '@/composables/useColorVariant';
    import { zoneName } from '@/data/spaces';
    import type { Space } from '@/data/types';
    import { computed } from 'vue';

    interface Props {
        space: Space;
        selectedZoneId: string | null;
    }

    const props = defineProps<Props>();
    const emit = defineEmits<{ selectZone: [id: string]; addZone: [column: number] }>();

    const columnCount = computed(() => props.space.layoutColumns || 1);
    const showHeaders = computed(() => columnCount.value > 1);

    const columns = computed(() =>
        Array.from({ length: columnCount.value }, (_, index) => ({
            index,
            label: props.space.columnLabels?.[index] ?? `Column ${index + 1}`,
            zones: props.space.zones
                .filter((z) => (z.column || 0) === index)
                .map((z) => {
                    const selected = z.id === props.selectedZoneId;
                    const meta = z.floor
                        ? 'floor · ground'
                        : `${z.facing || 'front'} wall${(z.levels || 1) > 1 ? ` · ${z.levels} levels` : ''}${z.hasDepth ? ' · front/back' : ''}`;
                    return {
                        id: z.id,
                        name: zoneName(z, props.space.type),
                        meta,
                        count: props.space.items.filter((it) => it.zoneId === z.id).length,
                        accentClass: zoneBgClasses[z.color],
                        btnClass: selected
                            ? 'border-text-3 bg-surface-2'
                            : 'border-border hover:border-border-strong',
                    };
                }),
        }))
    );

    function selectZone(id: string) {
        emit('selectZone', id);
    }
    function addZone(column: number) {
        emit('addZone', column);
    }
</script>
