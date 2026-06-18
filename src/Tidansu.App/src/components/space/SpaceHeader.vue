<template>
    <div class="flex flex-wrap items-center gap-4">
        <RouterLink
            :to="{ name: 'spaces' }"
            class="flex size-9 items-center justify-center rounded-ctrl border border-border bg-surface text-text-2 transition-colors hover:text-text"
            aria-label="Back to spaces"
        >
            <BaseIcon
                name="arrowL"
                :size="18"
            />
        </RouterLink>

        <div class="min-w-0 flex-1">
            <h1 class="truncate text-[22px] font-bold">{{ space.name }}</h1>
            <p class="text-[13px] text-text-3">{{ countsLabel }}</p>
        </div>

        <div
            v-if="showViewToggle"
            class="flex rounded-ctrl border border-border bg-surface-2 p-0.5"
        >
            <button
                type="button"
                class="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors"
                :class="listBtnClass"
                @click="onList"
            >
                <BaseIcon
                    name="list"
                    :size="15"
                />
                List
            </button>
            <button
                type="button"
                class="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors"
                :class="layoutBtnClass"
                @click="onLayout"
            >
                <BaseIcon
                    name="grid"
                    :size="15"
                />
                Layout
            </button>
        </div>

        <RouterLink
            :to="{ name: 'account' }"
            class="flex size-9 items-center justify-center rounded-chip bg-surface-3 text-[14px] font-bold text-text transition-opacity hover:opacity-80"
            :aria-label="avatarLabel"
        >
            {{ initial }}
        </RouterLink>
    </div>
</template>

<script setup lang="ts">
    import { BaseIcon } from '@/components/base';
    import type { Space, ViewMode } from '@/data/types';
    import { useSessionStore } from '@/stores/useSessionStore';
    import { computed } from 'vue';

    interface Props {
        space: Space;
        viewMode: ViewMode;
    }

    const props = defineProps<Props>();
    const emit = defineEmits<{ setView: [mode: ViewMode] }>();

    const session = useSessionStore();

    const countsLabel = computed(() => {
        const items = props.space.items.length;
        const zones = props.space.zones.length;
        return `${items} ${items === 1 ? 'item' : 'items'} · ${zones} ${zones === 1 ? 'zone' : 'zones'}`;
    });

    const showViewToggle = computed(() => props.space.type !== 'list');
    const listBtnClass = computed(() =>
        props.viewMode === 'layout' ? 'text-text-2 hover:text-text' : 'bg-surface-3 text-text'
    );
    const layoutBtnClass = computed(() =>
        props.viewMode === 'layout' ? 'bg-surface-3 text-text' : 'text-text-2 hover:text-text'
    );

    const initial = computed(() => session.user?.name?.charAt(0).toUpperCase() ?? '?');
    const avatarLabel = computed(() => `Account — ${session.user?.name ?? ''}`);

    function onList() {
        emit('setView', 'list');
    }
    function onLayout() {
        emit('setView', 'layout');
    }
</script>
