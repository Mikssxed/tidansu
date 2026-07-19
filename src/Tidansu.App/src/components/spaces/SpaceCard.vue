<template>
    <div
        class="group flex cursor-pointer flex-col rounded-card border border-border bg-surface p-[calc(16px*var(--pad))] transition-colors hover:border-border-strong"
        role="button"
        :aria-label="openLabel"
        @click="onOpen"
    >
        <div class="flex items-start gap-3">
            <span
                class="flex size-10 shrink-0 items-center justify-center rounded-ctrl border border-border bg-surface-2 text-text-2"
            >
                <BaseIcon
                    :name="typeDef.icon"
                    :size="20"
                />
            </span>
            <div class="min-w-0 flex-1">
                <h3 class="truncate text-[16px] font-bold text-text">{{ space.name }}</h3>
                <p class="text-[13px] text-text-3">{{ typeDef.title }}</p>
            </div>
            <div @click.stop>
                <BasePopoverMenu label="Space actions">
                    <BasePopoverMenuItem
                        icon="edit"
                        @click="onRename"
                    >
                        Rename
                    </BasePopoverMenuItem>
                    <BasePopoverMenuItem
                        icon="layers"
                        @click="onDuplicate"
                    >
                        Duplicate
                    </BasePopoverMenuItem>
                    <BasePopoverMenuItem
                        icon="trash"
                        danger
                        @click="onDelete"
                    >
                        Delete
                    </BasePopoverMenuItem>
                </BasePopoverMenu>
            </div>
        </div>

        <!-- mini preview: up to 6 zones as colored bands -->
        <div class="mt-4 flex flex-col gap-1.5">
            <div
                v-for="band in previewBands"
                :key="band.id"
                class="h-3 rounded-md opacity-85"
                :class="band.class"
            />
            <div
                v-if="!previewBands.length"
                class="h-3 rounded-md bg-surface-3"
            />
        </div>

        <div class="mt-4 flex items-center justify-between border-t border-border-faint pt-3">
            <span class="text-[12px] text-text-3">{{ countsLabel }}</span>
            <span
                class="inline-flex items-center gap-1 text-[13px] font-medium text-text-2 transition-colors group-hover:text-text"
            >
                Open
                <BaseIcon
                    name="arrowR"
                    :size="14"
                />
            </span>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { BaseIcon, BasePopoverMenu, BasePopoverMenuItem } from '@/components/base';
    import { zoneBgClasses } from '@/composables/useColorVariant';
    import { spaceTypeDef } from '@/data/spaces';
    import type { Space } from '@/data/types';
    import { computed } from 'vue';

    interface SpaceCardProps {
        space: Space;
    }

    const props = defineProps<SpaceCardProps>();

    const emit = defineEmits<{
        open: [id: string];
        rename: [id: string];
        duplicate: [id: string];
        delete: [id: string];
    }>();

    const typeDef = computed(() => spaceTypeDef(props.space.type));
    const openLabel = computed(() => `Open ${props.space.name}`);
    // Driven by the dashboard-summary fields (B-16) — `zones`/`items` stay empty
    // until the space is opened, so the counts/preview must not read those arrays.
    const previewBands = computed(() =>
        props.space.previewColors.map((color, i) => ({ id: `${props.space.id}-${i}`, class: zoneBgClasses[color] }))
    );
    const countsLabel = computed(() => {
        const items = props.space.itemCount;
        const zones = props.space.zoneCount;
        return `${items} ${items === 1 ? 'item' : 'items'} · ${zones} ${zones === 1 ? 'zone' : 'zones'}`;
    });

    function onOpen() {
        emit('open', props.space.id);
    }
    function onRename() {
        emit('rename', props.space.id);
    }
    function onDuplicate() {
        emit('duplicate', props.space.id);
    }
    function onDelete() {
        emit('delete', props.space.id);
    }
</script>
