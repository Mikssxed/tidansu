<template>
    <div class="w-full rounded-card border border-border bg-surface p-4">
        <div
            v-if="!zone"
            class="flex flex-col items-center gap-2 py-8 text-center text-text-3"
        >
            <BaseIcon
                name="settings"
                :size="20"
            />
            <p class="text-[13px]">{{ emptyHint }}</p>
        </div>

        <div v-else>
            <div class="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">
                <BaseIcon
                    name="settings"
                    :size="15"
                />
                Zone properties
            </div>

            <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <!-- Name -->
                <div class="sm:col-span-2 lg:col-span-3">
                    <label class="mb-1 block text-[12px] text-text-2">Name</label>
                    <input
                        v-model="label"
                        type="text"
                        :placeholder="autoName"
                        class="h-9 w-full rounded-ctrl border border-border bg-surface-2 px-3 text-[14px] text-text placeholder:text-text-3 focus:border-border-strong focus:outline-none"
                    />
                </div>

                <!-- Type -->
                <div>
                    <label class="mb-1 block text-[12px] text-text-2">Type</label>
                    <div class="flex rounded-ctrl border border-border bg-surface-2 p-0.5">
                        <button
                            v-for="k in kindOptions"
                            :key="k.id"
                            type="button"
                            class="flex-1 rounded-[8px] py-1.5 text-[13px] transition-colors"
                            :class="k.class"
                            @click="selectKind(k.id)"
                        >
                            {{ k.label }}
                        </button>
                    </div>
                </div>

                <!-- Color -->
                <div>
                    <label class="mb-1 block text-[12px] text-text-2">Color</label>
                    <div class="flex gap-2">
                        <button
                            v-for="sw in colorSwatches"
                            :key="sw.color"
                            type="button"
                            class="size-7 rounded-ctrl ring-offset-2 ring-offset-surface transition-shadow"
                            :class="sw.class"
                            :aria-label="sw.color"
                            @click="selectColor(sw.color)"
                        />
                    </div>
                </div>

                <!-- Levels -->
                <div v-if="!zone.floor">
                    <label class="mb-1 block text-[12px] text-text-2">Levels (tiers)</label>
                    <div class="flex items-center justify-between rounded-ctrl border border-border bg-surface-2 px-3 py-1.5">
                        <span class="text-[13px] text-text-2">Shelves in this unit</span>
                        <div class="flex items-center gap-3">
                            <button
                                type="button"
                                class="text-text-2 disabled:opacity-40"
                                :disabled="levelsAtMin"
                                @click="decLevels"
                            >
                                −
                            </button>
                            <span class="w-4 text-center text-[14px] tabular-nums text-text">{{ levels }}</span>
                            <button
                                type="button"
                                class="text-text-2 disabled:opacity-40"
                                :disabled="levelsAtMax"
                                @click="incLevels"
                            >
                                +
                            </button>
                        </div>
                    </div>
                    <!-- shelves stack top → bottom (level 1 = top) -->
                    <div class="mt-2 flex flex-col gap-1">
                        <div
                            v-for="lvl in levelPreview"
                            :key="lvl"
                            class="flex items-center gap-1.5 rounded-[6px] border border-border bg-surface-2 px-2 py-1 text-[11px] text-text-2"
                        >
                            <span
                                class="size-1.5 rounded-chip"
                                :class="accentClass"
                            />
                            L{{ lvl }}
                        </div>
                    </div>
                </div>

                <!-- Facing -->
                <div v-if="!zone.floor">
                    <label class="mb-1 block text-[12px] text-text-2">Facing wall</label>
                    <div class="grid grid-cols-4 gap-1 rounded-ctrl border border-border bg-surface-2 p-0.5">
                        <button
                            v-for="f in facingOptions"
                            :key="f.id"
                            type="button"
                            class="rounded-[8px] py-1.5 text-[12px] transition-colors"
                            :class="f.class"
                            @click="selectFacing(f.id)"
                        >
                            {{ f.label }}
                        </button>
                    </div>
                </div>

                <!-- Depth -->
                <div v-if="!zone.floor">
                    <label class="mb-1 block text-[12px] text-text-2">Depth</label>
                    <button
                        type="button"
                        class="flex w-full items-center gap-2 rounded-ctrl border bg-surface-2 px-3 py-2 text-left transition-colors"
                        :class="depthClass"
                        @click="toggleDepth"
                    >
                        <span class="flex size-4 items-center justify-center rounded-[5px] border border-border-strong">
                            <BaseIcon
                                v-if="zone.hasDepth"
                                name="check"
                                :size="13"
                            />
                        </span>
                        <span class="text-[13px] text-text">Has front / back layers</span>
                    </button>
                </div>

                <!-- Column -->
                <div v-if="showColumnPicker">
                    <label class="mb-1 block text-[12px] text-text-2">Column</label>
                    <div class="flex rounded-ctrl border border-border bg-surface-2 p-0.5">
                        <button
                            v-for="col in columnOptions"
                            :key="col.index"
                            type="button"
                            class="flex-1 rounded-[8px] py-1.5 text-[13px] transition-colors"
                            :class="col.class"
                            @click="selectColumn(col.index)"
                        >
                            {{ col.label }}
                        </button>
                    </div>
                </div>

                <BaseButton
                    variant="danger"
                    size="sm"
                    class="sm:col-span-2 lg:col-span-3"
                    @click="onDelete"
                >
                    <BaseIcon
                        name="trash"
                        :size="16"
                    />
                    Delete zone
                </BaseButton>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { BaseButton, BaseIcon } from '@/components/base';
    import { zoneBgClasses } from '@/composables/useColorVariant';
    import { FACINGS, ZONE_COLORS, zoneName } from '@/data/spaces';
    import type { Space, Zone, ZoneColor, ZoneFacing, ZoneKind } from '@/data/types';
    import { computed } from 'vue';

    interface Props {
        space: Space;
        zone: Zone | null;
        freeform: boolean;
    }

    const props = defineProps<Props>();
    const emit = defineEmits<{ update: [id: string, patch: Partial<Zone>]; delete: [id: string] }>();

    const emptyHint = computed(() =>
        props.freeform
            ? 'Draw a zone, or pick one to edit its name, wall, color and depth.'
            : 'Select a zone to edit its name, wall, color and depth.'
    );

    const autoName = computed(() =>
        props.zone ? zoneName({ ...props.zone, label: null }, props.space.type) : ''
    );

    const label = computed({
        get: () => props.zone?.label ?? '',
        set: (v: string) => {
            if (props.zone) emit('update', props.zone.id, { label: v.trim() ? v : null });
        },
    });

    const currentKind = computed<ZoneKind>(() =>
        props.zone?.floor ? 'floor' : props.zone?.kind ?? 'shelf'
    );
    const kindOptions = computed(() =>
        (['shelf', 'drawer', 'floor'] as ZoneKind[]).map((id) => ({
            id,
            label: id.charAt(0).toUpperCase() + id.slice(1),
            class: currentKind.value === id ? 'bg-surface-3 text-text' : 'text-text-2',
        }))
    );

    const colorSwatches = computed(() =>
        ZONE_COLORS.map((color) => ({
            color,
            class: `${zoneBgClasses[color]} ${props.zone?.color === color ? 'ring-2 ring-text' : ''}`,
        }))
    );

    const levels = computed(() => Math.max(1, props.zone?.levels || 1));
    const levelsAtMin = computed(() => levels.value <= 1);
    const accentClass = computed(() =>
        props.zone ? zoneBgClasses[props.zone.color] : 'bg-zone-gray'
    );
    const levelPreview = computed(() =>
        Array.from({ length: Math.min(levels.value, 12) }, (_, i) => i + 1)
    );
    const levelsAtMax = computed(() => levels.value >= 12);

    const facingOptions = computed(() => {
        const current = props.zone?.facing ?? 'front';
        return FACINGS.map(([id, label]) => ({
            id: id as ZoneFacing,
            label,
            class: current === id ? 'bg-surface-3 text-text' : 'text-text-2',
        }));
    });

    const depthClass = computed(() =>
        props.zone?.hasDepth ? 'border-text-3' : 'border-border hover:border-border-strong'
    );

    const showColumnPicker = computed(() => !props.freeform && props.space.layoutColumns > 1);
    const columnOptions = computed(() =>
        Array.from({ length: props.space.layoutColumns }, (_, index) => ({
            index,
            label: props.space.columnLabels?.[index] ?? `Col ${index + 1}`,
            class: (props.zone?.column || 0) === index ? 'bg-surface-3 text-text' : 'text-text-2',
        }))
    );

    function update(patch: Partial<Zone>) {
        if (props.zone) emit('update', props.zone.id, patch);
    }
    function selectKind(k: ZoneKind) {
        if (k === 'floor') update({ kind: 'floor', floor: true, hasDepth: false });
        else update({ kind: k, floor: false });
    }
    function selectColor(c: ZoneColor) {
        update({ color: c });
    }
    function decLevels() {
        update({ levels: Math.max(1, levels.value - 1) });
    }
    function incLevels() {
        update({ levels: Math.min(12, levels.value + 1) });
    }
    function selectFacing(f: ZoneFacing) {
        update({ facing: f });
    }
    function toggleDepth() {
        update({ hasDepth: !props.zone?.hasDepth });
    }
    function selectColumn(c: number) {
        update({ column: c });
    }
    function onDelete() {
        if (props.zone) emit('delete', props.zone.id);
    }
</script>
