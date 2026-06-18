<template>
    <div class="rounded-card border border-border bg-surface p-3">
        <div class="flex items-center gap-2">
            <span
                class="size-2.5 rounded-[3px]"
                :class="accentClass"
            />
            <span class="text-[14px] font-semibold text-text">{{ name }}</span>
            <span class="text-[12px] text-text-3">{{ metaLabel }}</span>
            <div
                v-if="zone.hasDepth"
                class="ml-auto flex rounded-ctrl border border-border bg-surface-2 p-0.5"
            >
                <button
                    type="button"
                    class="rounded-[7px] px-2 py-1 text-[12px] transition-colors"
                    :class="frontTabClass"
                    @click="setDepth('front')"
                >
                    Front
                </button>
                <button
                    type="button"
                    class="rounded-[7px] px-2 py-1 text-[12px] transition-colors"
                    :class="backTabClass"
                    @click="setDepth('back')"
                >
                    Back
                </button>
            </div>
        </div>

        <div class="mt-2.5 flex flex-col gap-1.5">
            <div
                v-for="row in levelRows"
                :key="row.level"
                class="flex items-start gap-2"
            >
                <span
                    v-if="showLevelTags"
                    class="mt-1 w-6 shrink-0 text-[11px] text-text-3"
                    :title="row.levelTitle"
                >
                    {{ row.levelTag }}
                </span>
                <div class="flex flex-1 flex-wrap items-center gap-1.5 rounded-ctrl border border-border-faint bg-surface-2 p-2">
                    <span
                        v-if="row.empty"
                        class="text-[12px] text-text-3"
                    >
                        {{ emptyLabel }}
                    </span>
                    <ItemChip
                        v-for="it in row.items"
                        :key="it.id"
                        :item="it"
                        :selected-id="selectedId"
                        @select="onSelect"
                    />
                    <AddChip @add="onAdd(row.level)" />
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
    import { computed, ref } from 'vue';

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

    const depth = ref<ItemDepth>('front');

    const accentClass = computed(() => zoneBgClasses[props.zone.color]);
    const name = computed(() => zoneName(props.zone, props.space.type));
    const levels = computed(() => Math.max(1, props.zone.levels || 1));
    const showLevelTags = computed(() => levels.value > 1);
    const activeDepth = computed<ItemDepth | null>(() => (props.zone.hasDepth ? depth.value : null));
    const emptyLabel = computed(() => `Empty${props.zone.hasDepth ? ` (${depth.value})` : ''}`);

    const metaLabel = computed(() => {
        const total = itemsOf(props.space, props.zone.id).length;
        let s = `${total} ${total === 1 ? 'item' : 'items'}`;
        if (levels.value > 1) s += ` · ${levels.value} levels`;
        if (props.zone.kind === 'drawer') s += ' · drawer';
        return s;
    });

    const levelRows = computed(() =>
        Array.from({ length: levels.value }, (_, i) => {
            const level = i + 1;
            const items = itemsOf(props.space, props.zone.id, activeDepth.value, level);
            return {
                level,
                items,
                empty: items.length === 0,
                levelTag: `L${level}`,
                levelTitle: `Level ${level}`,
            };
        })
    );

    const frontTabClass = computed(() =>
        depth.value === 'front' ? 'bg-surface-3 text-text' : 'text-text-2'
    );
    const backTabClass = computed(() =>
        depth.value === 'back' ? 'bg-surface-3 text-text' : 'text-text-2'
    );

    function setDepth(d: ItemDepth) {
        depth.value = d;
    }
    function onSelect(id: string) {
        emit('select', id);
    }
    function onAdd(level: number) {
        emit('add', { zoneId: props.zone.id, depth: activeDepth.value ?? 'front', level });
    }
</script>
