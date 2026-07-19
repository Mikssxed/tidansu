<template>
    <div
        class="flex cursor-pointer items-center gap-3 rounded-ctrl border border-border bg-surface py-2.5 pl-2.5 pr-2 transition-colors hover:border-border-strong"
        role="button"
        tabindex="0"
        @click="onSelect"
    >
        <span
            class="h-9 w-1 shrink-0 rounded-chip"
            :class="accentClass"
        />
        <span class="flex size-8 shrink-0 items-center justify-center rounded-ctrl bg-surface-2 text-text-2">
            <BaseIcon
                :name="iconName"
                :size="18"
            />
        </span>
        <div class="min-w-0 flex-1">
            <div class="truncate text-[14px] font-semibold text-text">{{ item.name }}</div>
            <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                    v-if="showZonePill"
                    class="inline-flex items-center gap-1 rounded-chip bg-surface-2 px-2 py-0.5 text-[12px] text-text-2"
                >
                    <span
                        class="size-1.5 rounded-chip"
                        :class="accentClass"
                    />
                    {{ zonePillName }}
                </span>
                <span
                    v-if="detailText"
                    class="text-[12px] text-text-3"
                >
                    {{ detailText }}
                </span>
                <ItemExpiry :iso="item.expiry" />
            </div>
        </div>
        <span class="text-[13px] tabular-nums text-text-2">{{ qtyLabel }}</span>
        <button
            v-if="!readOnly"
            type="button"
            class="flex size-8 items-center justify-center rounded-ctrl text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
            aria-label="Remove"
            @click.stop="onRemove"
        >
            <BaseIcon
                name="x"
                :size="16"
            />
        </button>
    </div>
</template>

<script setup lang="ts">
    import { BaseIcon } from '@/components/base';
    import ItemExpiry from '@/components/space/ItemExpiry.vue';
    import { zoneBgClasses } from '@/composables/useColorVariant';
    import { itemIcon } from '@/components/icons';
    import { zoneName } from '@/data/spaces';
    import type { Item, SpaceTypeId, Zone } from '@/data/types';
    import { computed } from 'vue';

    interface ItemRowProps {
        item: Item;
        zone: Zone | null;
        type: SpaceTypeId;
        hideZone?: boolean;
        readOnly?: boolean;
    }

    const props = withDefaults(defineProps<ItemRowProps>(), { hideZone: false, readOnly: false });
    const emit = defineEmits<{ select: [id: string]; remove: [id: string] }>();

    const iconName = computed(() => props.item.icon ?? itemIcon(props.item.name));
    const accentClass = computed(() =>
        props.zone ? zoneBgClasses[props.zone.color] : 'bg-zone-gray'
    );
    const showZonePill = computed(() => props.zone !== null && !props.hideZone);
    const zonePillName = computed(() =>
        props.zone ? zoneName(props.zone, props.type) : ''
    );
    const qtyLabel = computed(() => `×${props.item.quantity}`);

    const detailText = computed(() => {
        const z = props.zone;
        if (!z) return '';
        const parts: string[] = [];
        if (z.facing && z.facing !== 'front') parts.push(`${z.facing} wall`);
        if ((z.levels || 1) > 1) parts.push(`L${props.item.level || 1}`);
        if (z.hasDepth) parts.push(props.item.depth || 'front');
        return parts.join(' · ');
    });

    function onSelect() {
        emit('select', props.item.id);
    }
    function onRemove() {
        emit('remove', props.item.id);
    }
</script>
