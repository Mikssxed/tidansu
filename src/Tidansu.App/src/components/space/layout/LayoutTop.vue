<template>
    <!-- Columns mode -->
    <div
        v-if="!isFree"
        class="flex gap-4 overflow-x-auto"
    >
        <div
            v-for="col in columns"
            :key="col.index"
            class="flex min-w-[240px] flex-1 flex-col gap-2"
        >
            <div
                v-if="showColumnHeaders"
                class="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-text-3"
            >
                <BaseIcon
                    name="columns"
                    :size="13"
                />
                {{ col.label }}
            </div>
            <p
                v-if="col.zones.length === 0"
                class="text-[13px] text-text-3"
            >
                No zones here yet.
            </p>
            <MapZone
                v-for="zone in col.zones"
                :key="zone.id"
                :zone="zone"
                :space="space"
                :selected-id="selectedId"
                @select="onSelect"
                @add="onAdd"
            />
        </div>
    </div>

    <!-- Freeform mode -->
    <div
        v-else
        class="overflow-auto"
    >
        <div
            v-if="placed.length === 0"
            class="rounded-card border border-dashed border-border-strong p-10 text-center"
        >
            <div class="text-[15px] font-bold text-text">No zones drawn yet</div>
            <div class="mt-1 text-[13px] text-text-2">
                Hit "Edit layout" to draw shelves on the canvas.
            </div>
        </div>
        <div
            v-else
            class="relative"
            :style="canvasStyle"
        >
            <div
                v-for="p in placed"
                :key="p.id"
                class="absolute"
                :style="p.style"
            >
                <MapZone
                    :zone="p.zone"
                    :space="space"
                    :selected-id="selectedId"
                    @select="onSelect"
                    @add="onAdd"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { BaseIcon } from '@/components/base';
    import MapZone from '@/components/space/layout/MapZone.vue';
    import type { ItemDepth, Space, Zone } from '@/data/types';
    import { computed } from 'vue';

    interface Props {
        space: Space;
        selectedId: string | null;
    }

    const props = defineProps<Props>();
    const emit = defineEmits<{
        select: [id: string];
        add: [payload: { zoneId: string; depth: ItemDepth; level: number }];
    }>();

    const isFree = computed(() => props.space.canvasMode === 'freeform');
    const columnCount = computed(() => props.space.layoutColumns || 1);
    const showColumnHeaders = computed(() => columnCount.value > 1);

    const columns = computed(() =>
        Array.from({ length: columnCount.value }, (_, c) => ({
            index: c,
            label: props.space.columnLabels?.[c] ?? `Column ${c + 1}`,
            zones: props.space.zones.filter((z) => (z.column || 0) === c),
        }))
    );

    const positioned = computed(() => props.space.zones.filter((z): z is Zone & { rect: NonNullable<Zone['rect']> } => z.rect !== null));

    const offsets = computed(() => {
        const zs = positioned.value;
        if (!zs.length) return { ox: 24, oy: 24 };
        const minX = Math.min(...zs.map((z) => z.rect.x));
        const minY = Math.min(...zs.map((z) => z.rect.y));
        return { ox: 24 - minX, oy: 24 - minY };
    });

    const placed = computed(() => {
        const { ox, oy } = offsets.value;
        return positioned.value.map((z) => ({
            id: z.id,
            zone: z,
            style: {
                left: `${z.rect.x + ox}px`,
                top: `${z.rect.y + oy}px`,
                width: `${z.rect.w}px`,
                height: `${z.rect.h}px`,
            },
        }));
    });

    const canvasStyle = computed(() => {
        const { ox, oy } = offsets.value;
        const zs = positioned.value;
        const w = Math.max(360, ...zs.map((z) => z.rect.x + ox + z.rect.w)) + 24;
        const h = Math.max(240, ...zs.map((z) => z.rect.y + oy + z.rect.h)) + 24;
        return { width: `${w}px`, height: `${h}px` };
    });

    function onSelect(id: string) {
        emit('select', id);
    }
    function onAdd(payload: { zoneId: string; depth: ItemDepth; level: number }) {
        emit('add', payload);
    }
</script>
