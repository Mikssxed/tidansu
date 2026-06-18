<template>
    <div class="flex flex-col gap-5">
        <p
            v-if="wallZones.length === 0 && floorZones.length === 0"
            class="rounded-card border border-dashed border-border-strong p-6 text-center text-[13px] text-text-3"
        >
            No shelves yet — draw some in "Edit layout".
        </p>

        <div :class="wallsClass">
            <div
                v-for="wall in walls"
                :key="wall.id"
                class="min-w-0 flex-1"
            >
                <div
                    v-if="multiWall"
                    class="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-text-3"
                >
                    <BaseIcon
                        name="columns"
                        :size="13"
                    />
                    {{ wall.label }} wall
                    <span class="text-text-3">{{ wall.countLabel }}</span>
                </div>
                <div class="flex flex-col gap-3">
                    <ShelfUnit
                        v-for="zone in wall.zones"
                        :key="zone.id"
                        :zone="zone"
                        :space="space"
                        :selected-id="selectedId"
                        @select="onSelect"
                        @add="onAdd"
                    />
                </div>
            </div>
        </div>

        <!-- floor strip -->
        <div
            v-if="floorZones.length > 0"
            class="flex flex-col gap-3"
        >
            <div
                v-for="floor in floorBands"
                :key="floor.id"
                class="rounded-card border border-border bg-surface p-3"
            >
                <div class="flex items-center gap-2 text-[13px] text-text-2">
                    <BaseIcon
                        name="floor"
                        :size="14"
                    />
                    <span class="font-semibold text-text">{{ floor.name }}</span>
                    <span class="text-[12px] text-text-3">{{ floor.metaLabel }}</span>
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-1.5 rounded-ctrl border border-border-faint bg-surface-2 p-2">
                    <span
                        v-if="floor.empty"
                        class="text-[12px] text-text-3"
                    >
                        Nothing on the floor
                    </span>
                    <ItemChip
                        v-for="it in floor.items"
                        :key="it.id"
                        :item="it"
                        :selected-id="selectedId"
                        @select="onSelect"
                    />
                    <AddChip @add="onAddFloor(floor.id)" />
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { BaseIcon } from '@/components/base';
    import AddChip from '@/components/space/layout/AddChip.vue';
    import ItemChip from '@/components/space/layout/ItemChip.vue';
    import ShelfUnit from '@/components/space/layout/ShelfUnit.vue';
    import { itemsOf } from '@/data/items';
    import { FACINGS, WALL_ORDER, zoneName } from '@/data/spaces';
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

    const wallZones = computed(() => props.space.zones.filter((z) => !z.floor));
    const floorZones = computed(() => props.space.zones.filter((z) => z.floor));

    function order(a: Zone, b: Zone): number {
        if (props.space.canvasMode === 'freeform') {
            const ay = a.rect ? a.rect.y : 1e9;
            const by = b.rect ? b.rect.y : 1e9;
            return ay - by || (a.rect?.x ?? 0) - (b.rect?.x ?? 0);
        }
        return (a.column || 0) - (b.column || 0) || a.position - b.position;
    }

    const labelOf = (id: string) => FACINGS.find((f) => f[0] === id)?.[1] ?? id;

    const walls = computed(() =>
        WALL_ORDER.map((id) => {
            const zones = wallZones.value
                .filter((z) => (z.facing || 'front') === id)
                .sort(order);
            return {
                id,
                label: labelOf(id),
                zones,
                countLabel: `${zones.length} ${zones.length === 1 ? 'unit' : 'units'}`,
            };
        }).filter((w) => w.zones.length > 0)
    );

    const multiWall = computed(() => walls.value.length > 1);
    const wallsClass = computed(() =>
        multiWall.value ? 'flex flex-wrap gap-4' : 'flex flex-col gap-3'
    );

    const floorBands = computed(() =>
        floorZones.value.map((z) => {
            const items = itemsOf(props.space, z.id);
            return {
                id: z.id,
                name: zoneName(z, props.space.type),
                items,
                empty: items.length === 0,
                metaLabel: `on the ground · ${items.length}`,
            };
        })
    );

    function onSelect(id: string) {
        emit('select', id);
    }
    function onAdd(payload: { zoneId: string; depth: ItemDepth; level: number }) {
        emit('add', payload);
    }
    function onAddFloor(zoneId: string) {
        emit('add', { zoneId, depth: 'front', level: 1 });
    }
</script>
