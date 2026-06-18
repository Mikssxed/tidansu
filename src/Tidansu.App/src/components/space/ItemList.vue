<template>
    <div>
        <!-- controls -->
        <div class="mt-4 flex flex-wrap items-center gap-3">
            <div class="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-ctrl border border-border bg-surface-2 px-3">
                <BaseIcon
                    name="search"
                    :size="17"
                    class="shrink-0 text-text-3"
                />
                <input
                    v-model="search"
                    type="text"
                    class="h-full w-full bg-transparent text-[14px] text-text placeholder:text-text-3 focus:outline-none"
                    :placeholder="searchPlaceholder"
                />
                <button
                    v-if="showClear"
                    type="button"
                    class="shrink-0 text-text-3 hover:text-text"
                    aria-label="Clear search"
                    @click="clearSearch"
                >
                    <BaseIcon
                        name="x"
                        :size="15"
                    />
                </button>
            </div>
            <div class="flex rounded-ctrl border border-border bg-surface-2 p-0.5">
                <button
                    type="button"
                    class="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors"
                    :class="listSegClass"
                    @click="setGrouped(false)"
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
                    :class="zoneSegClass"
                    @click="setGrouped(true)"
                >
                    <BaseIcon
                        name="layers"
                        :size="15"
                    />
                    By zone
                </button>
            </div>
        </div>

        <!-- empty -->
        <div
            v-if="isEmpty"
            class="mt-10 text-center"
        >
            <div class="text-[16px] font-bold text-text">{{ emptyTitle }}</div>
            <div class="mt-1 text-[14px] text-text-2">{{ emptyDesc }}</div>
        </div>

        <!-- flat list -->
        <div
            v-else-if="!grouped"
            class="mt-4 flex flex-col gap-2"
        >
            <ItemRow
                v-for="row in flatRows"
                :key="row.item.id"
                :item="row.item"
                :zone="row.zone"
                :type="space.type"
                @select="onSelect"
                @remove="onRemove"
            />
        </div>

        <!-- grouped -->
        <div
            v-else
            class="mt-4 flex flex-col gap-3"
        >
            <div
                v-for="group in groups"
                :key="group.id"
                class="overflow-hidden rounded-card border border-border bg-surface"
            >
                <button
                    type="button"
                    class="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
                    :aria-expanded="group.open"
                    @click="toggle(group.id)"
                >
                    <span
                        class="size-2.5 rounded-[3px]"
                        :class="group.accentClass"
                    />
                    <span class="text-[14px] font-semibold text-text">{{ group.name }}</span>
                    <span class="text-[12px] text-text-3">{{ group.countLabel }}</span>
                    <BaseIcon
                        name="chevRight"
                        :size="16"
                        class="ml-auto text-text-3 transition-transform"
                        :class="group.chevronClass"
                    />
                </button>
                <div
                    v-if="group.open"
                    class="flex flex-col gap-2 px-3 pb-3"
                >
                    <ItemRow
                        v-for="row in group.rows"
                        :key="row.item.id"
                        :item="row.item"
                        :zone="row.zone"
                        :type="space.type"
                        hide-zone
                        @select="onSelect"
                        @remove="onRemove"
                    />
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { BaseIcon } from '@/components/base';
    import ItemRow from '@/components/space/ItemRow.vue';
    import { zoneBgClasses } from '@/composables/useColorVariant';
    import { expiryStatus } from '@/data/dates';
    import { zoneName } from '@/data/spaces';
    import type { Item, Space, Zone } from '@/data/types';
    import { computed, ref } from 'vue';

    const props = defineProps<{ space: Space }>();
    const emit = defineEmits<{ select: [id: string]; remove: [id: string] }>();

    const search = ref('');
    const grouped = ref(false);
    const collapsedIds = ref<Set<string>>(new Set());

    const query = computed(() => search.value.trim().toLowerCase());
    const showClear = computed(() => query.value.length > 0);
    const searchPlaceholder = computed(() => `Search ${props.space.items.length} items…`);

    const zoneById = computed(() => {
        const map = new Map<string, Zone>();
        props.space.zones.forEach((z) => map.set(z.id, z));
        return map;
    });

    const filtered = computed(() => {
        const q = query.value;
        if (!q) return props.space.items;
        return props.space.items.filter(
            (it) => it.name.toLowerCase().includes(q) || it.tags.some((t) => t.includes(q))
        );
    });

    const flatRows = computed(() =>
        filtered.value.map((it: Item) => ({ item: it, zone: zoneById.value.get(it.zoneId) ?? null }))
    );

    const groups = computed(() =>
        props.space.zones
            .map((z) => {
                const rows = filtered.value
                    .filter((it) => it.zoneId === z.id)
                    .map((it) => ({ item: it, zone: z }));
                const soon = rows.filter((r) => {
                    const s = expiryStatus(r.item.expiry);
                    return s === 'soon' || s === 'today' || s === 'gone';
                }).length;
                const open = !collapsedIds.value.has(z.id);
                return {
                    id: z.id,
                    name: zoneName(z, props.space.type),
                    accentClass: zoneBgClasses[z.color],
                    countLabel: soon > 0 ? `· ${rows.length} · ${soon} expiring` : `· ${rows.length}`,
                    chevronClass: open ? 'rotate-90' : '',
                    open,
                    rows,
                };
            })
            .filter((g) => g.rows.length > 0)
    );

    const isEmpty = computed(() => filtered.value.length === 0);
    const emptyTitle = computed(() =>
        props.space.items.length === 0 ? 'Nothing here yet' : 'No matches'
    );
    const emptyDesc = computed(() =>
        props.space.items.length === 0
            ? 'Add your first item above — try "milk, top shelf".'
            : 'Try a different search.'
    );

    const listSegClass = computed(() =>
        grouped.value ? 'text-text-2 hover:text-text' : 'bg-surface-3 text-text'
    );
    const zoneSegClass = computed(() =>
        grouped.value ? 'bg-surface-3 text-text' : 'text-text-2 hover:text-text'
    );

    function setGrouped(value: boolean) {
        grouped.value = value;
    }
    function clearSearch() {
        search.value = '';
    }
    function toggle(zoneId: string) {
        const next = new Set(collapsedIds.value);
        if (next.has(zoneId)) next.delete(zoneId);
        else next.add(zoneId);
        collapsedIds.value = next;
    }
    function onSelect(id: string) {
        emit('select', id);
    }
    function onRemove(id: string) {
        emit('remove', id);
    }
</script>
