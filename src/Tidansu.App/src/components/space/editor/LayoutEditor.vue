<template>
    <div class="mt-2">
        <!-- bar -->
        <div class="flex items-center gap-3">
            <button
                type="button"
                class="flex size-9 items-center justify-center rounded-ctrl border border-border bg-surface text-text-2 transition-colors hover:text-text"
                aria-label="Back"
                @click="onDone"
            >
                <BaseIcon
                    name="arrowL"
                    :size="18"
                />
            </button>
            <div class="min-w-0 flex-1">
                <div class="text-[16px] font-bold">Edit layout</div>
                <div class="text-[12px] text-text-3">{{ subtitle }}</div>
            </div>
            <BaseButton
                v-if="!freeform"
                variant="secondary"
                size="sm"
                @click="onConvert"
            >
                <BaseIcon
                    name="square"
                    :size="15"
                />
                Draw freely
            </BaseButton>
            <BaseButton
                size="sm"
                @click="onDone"
            >
                <BaseIcon
                    name="check"
                    :size="16"
                />
                Done
            </BaseButton>
        </div>

        <!-- body -->
        <div class="mt-4 flex flex-col gap-4 lg:flex-row">
            <div
                v-if="freeform"
                class="flex shrink-0 gap-2 lg:flex-col"
            >
                <button
                    v-for="t in tools"
                    :key="t.id"
                    type="button"
                    class="flex flex-col items-center gap-1 rounded-ctrl border px-3 py-2 text-[11px] transition-colors"
                    :class="t.class"
                    :title="t.label"
                    @click="setTool(t.id)"
                >
                    <BaseIcon
                        :name="t.icon"
                        :size="19"
                    />
                    {{ t.label }}
                </button>
            </div>

            <div class="min-w-0 flex-1">
                <FreeCanvas
                    v-if="freeform"
                    :space="space"
                    :selected-zone-id="selectedZoneId"
                    :tool="tool"
                    @select-zone="onSelectZone"
                    @update-zone="onUpdateZone"
                    @delete-zone="onDeleteZone"
                    @add-zone-free="onAddZoneFree"
                />
                <ColumnsEdit
                    v-else
                    :space="space"
                    :selected-zone-id="selectedZoneId"
                    @select-zone="onSelectZone"
                    @add-zone="onAddZoneColumn"
                />
            </div>

            <ZoneProps
                :space="space"
                :zone="selectedZone"
                :freeform="freeform"
                @update="onUpdateZone"
                @delete="onDeleteZone"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
    import { BaseButton, BaseIcon } from '@/components/base';
    import type { IconName } from '@/components/icons';
    import ColumnsEdit from '@/components/space/editor/ColumnsEdit.vue';
    import FreeCanvas from '@/components/space/editor/FreeCanvas.vue';
    import ZoneProps from '@/components/space/editor/ZoneProps.vue';
    import type { Rect, Space, Zone, ZoneKind } from '@/data/types';
    import { computed, ref } from 'vue';

    interface Props {
        space: Space;
    }

    const props = defineProps<Props>();
    const emit = defineEmits<{
        done: [];
        addColumnZone: [column: number];
        addFreeZone: [rect: Rect, kind: ZoneKind];
        updateZone: [id: string, patch: Partial<Zone>];
        deleteZone: [id: string];
        convert: [];
    }>();

    const TOOLS: { id: string; icon: IconName; label: string }[] = [
        { id: 'move', icon: 'cursor', label: 'Move' },
        { id: 'draw', icon: 'square', label: 'Zone' },
        { id: 'drawer', icon: 'drawer', label: 'Drawer' },
        { id: 'floor', icon: 'floor', label: 'Floor' },
        { id: 'delete', icon: 'trash', label: 'Delete' },
    ];

    const tool = ref('move');
    const selectedZoneId = ref<string | null>(null);

    const freeform = computed(() => props.space.canvasMode === 'freeform');
    const subtitle = computed(() =>
        freeform.value ? 'Free canvas — draw zones anywhere' : 'Column layout'
    );
    const selectedZone = computed(
        () => props.space.zones.find((z) => z.id === selectedZoneId.value) ?? null
    );

    const tools = computed(() =>
        TOOLS.map((t) => ({
            ...t,
            class:
                tool.value === t.id
                    ? 'border-text-3 bg-surface-2 text-text'
                    : 'border-border text-text-2 hover:text-text',
        }))
    );

    function setTool(id: string) {
        tool.value = id;
    }
    function onSelectZone(id: string | null) {
        selectedZoneId.value = id;
    }
    function onUpdateZone(id: string, patch: Partial<Zone>) {
        emit('updateZone', id, patch);
    }
    function onDeleteZone(id: string) {
        if (selectedZoneId.value === id) selectedZoneId.value = null;
        emit('deleteZone', id);
    }
    function onAddZoneColumn(column: number) {
        emit('addColumnZone', column);
    }
    function onAddZoneFree(rect: Rect, kind: ZoneKind) {
        emit('addFreeZone', rect, kind);
    }
    function onConvert() {
        emit('convert');
    }
    function onDone() {
        emit('done');
    }
</script>
