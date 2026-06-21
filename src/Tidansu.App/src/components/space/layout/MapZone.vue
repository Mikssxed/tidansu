<template>
    <div
        class="flex h-full flex-col rounded-card border border-border bg-surface p-2.5"
        :class="floorClass"
    >
        <div class="flex items-center gap-1.5">
            <span
                class="size-2.5 rounded-[3px]"
                :class="accentClass"
            />
            <span class="text-[13px] font-semibold text-text">{{ name }}</span>
            <span class="ml-auto text-[12px] text-text-3">{{ countLabel }}</span>
        </div>
        <div class="mt-2 flex flex-1 flex-col gap-1.5">
            <div
                v-for="band in bands"
                :key="band.key"
                :class="band.bandClass"
            >
                <span
                    v-if="band.tag"
                    class="mb-1 block text-[11px] text-text-3"
                >
                    {{ band.tag }}
                </span>
                <div class="flex flex-wrap items-center gap-1">
                    <span
                        v-if="band.empty"
                        class="text-[12px] text-text-3"
                    >
                        Empty
                    </span>
                    <ItemChip
                        v-for="it in band.items"
                        :key="it.id"
                        :item="it"
                        :selected-id="selectedId"
                        size="sm"
                        @select="onSelect"
                    />
                    <AddChip
                        label=""
                        @add="onAdd(band.depth)"
                    />
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import AddChip from '@/components/space/layout/AddChip.vue';
    import ItemChip from '@/components/space/layout/ItemChip.vue';
    import { zoneBgClasses } from '@/composables/useColorVariant';
    import { itemsOf } from '@/data/items';
    import { zoneName } from '@/data/spaces';
    import type { ItemDepth, Space, Zone } from '@/data/types';
    import { computed } from 'vue';

    interface Props {
        zone: Zone;
        space: Space;
        selectedId: string | null;
    }

    const props = defineProps<Props>();
    const emit = defineEmits<{
        select: [id: string];
        add: [payload: { zoneId: string; depth: ItemDepth; level: number }];
    }>();

    const accentClass = computed(() => zoneBgClasses[props.zone.color]);
    const floorClass = computed(() => (props.zone.floor ? 'border-dashed' : ''));
    const name = computed(() => zoneName(props.zone, props.space.type));
    const total = computed(() => itemsOf(props.space, props.zone.id).length);
    const levels = computed(() => Math.max(1, props.zone.levels || 1));

    const countLabel = computed(() => {
        if (props.zone.floor) return `ground · ${total.value}`;
        return `${levels.value > 1 ? `${levels.value}L · ` : ''}${total.value}`;
    });

    const LABELED_BAND_CLASS = 'rounded-ctrl border border-border-faint bg-surface-2 p-1.5';

    // bands: depth split for shelves with depth; single band otherwise. Levels are
    // aggregated (they stack vertically — invisible from the top).
    const bands = computed(() => {
        const keys: (ItemDepth | null)[] = props.zone.hasDepth ? ['back', 'front'] : [null];
        return keys.map((key) => {
            const items = itemsOf(props.space, props.zone.id, key);
            return {
                key: key ?? 'all',
                depth: (key ?? 'front') as ItemDepth,
                tag: key ? (key === 'back' ? 'Back' : 'Front') : '',
                labeled: key !== null,
                bandClass: key !== null ? LABELED_BAND_CLASS : '',
                items,
                empty: items.length === 0,
            };
        });
    });

    function onSelect(id: string) {
        emit('select', id);
    }
    function onAdd(depth: ItemDepth) {
        emit('add', { zoneId: props.zone.id, depth, level: 1 });
    }
</script>
