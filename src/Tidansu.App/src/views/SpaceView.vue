<template>
    <div
        v-if="space"
        class="mx-auto w-full max-w-[1000px]"
    >
        <SpaceHeader
            :space="space"
            :view-mode="viewMode"
            @set-view="onSetView"
        />

        <!-- List view -->
        <div v-if="viewMode === 'list'">
            <div class="mt-6">
                <SmartAdd
                    :last-zone-name="lastZoneName"
                    @add="onAdd"
                />
            </div>

            <ItemList
                :space="space"
                @select="onSelect"
                @remove="onRemove"
            />

            <div
                v-if="showPromo"
                class="mt-6"
            >
                <SeeAsLayoutPromo
                    :item-count="space.items.length"
                    @open="onOpenLayout"
                    @dismiss="dismissPromo"
                />
            </div>
        </div>

        <!-- Layout view (spatial layout + editor) — built in the next Phase 6 item -->
        <div
            v-else
            class="mt-8 rounded-card border border-dashed border-border-strong p-10 text-center text-text-2"
        >
            Spatial layout view + editor are coming next in this phase.
        </div>

        <ItemDetailModal
            :open="isDetailOpen"
            :item="selectedItem"
            :zone="selectedZone"
            :type="space.type"
            :can-photo="session.isPro"
            @close="closeDetail"
            @remove="onRemove"
            @photo-locked="onPhotoLocked"
        />
    </div>
</template>

<script setup lang="ts">
    import ItemDetailModal from '@/components/space/ItemDetailModal.vue';
    import ItemList from '@/components/space/ItemList.vue';
    import SeeAsLayoutPromo from '@/components/space/SeeAsLayoutPromo.vue';
    import SmartAdd from '@/components/space/SmartAdd.vue';
    import SpaceHeader from '@/components/space/SpaceHeader.vue';
    import type { ViewMode } from '@/data/types';
    import { useSessionStore } from '@/stores/useSessionStore';
    import { useSpacesStore } from '@/stores/useSpacesStore';
    import { computed, ref, watch } from 'vue';
    import { useRouter } from 'vue-router';

    const props = defineProps<{ id: string }>();

    const store = useSpacesStore();
    const session = useSessionStore();
    const router = useRouter();

    const space = computed(() => store.getById(props.id));
    const viewMode = computed<ViewMode>(() => space.value?.viewMode ?? 'list');

    const selectedId = ref<string | null>(null);
    const lastZoneId = ref<string | null>(null);
    const promoDismissed = ref(false);

    // Track the open space; bounce to the dashboard if the id is unknown (e.g. deleted).
    watch(
        space,
        (value) => {
            if (!value) router.replace({ name: 'spaces' });
            else store.currentId = value.id;
        },
        { immediate: true }
    );

    const selectedItem = computed(
        () => space.value?.items.find((it) => it.id === selectedId.value) ?? null
    );
    const selectedZone = computed(
        () => space.value?.zones.find((z) => z.id === selectedItem.value?.zoneId) ?? null
    );
    const isDetailOpen = computed(() => selectedItem.value !== null);

    const lastZoneName = computed(() => {
        const zone = space.value?.zones.find((z) => z.id === lastZoneId.value);
        return zone ? (zone.label ?? `Zone ${zone.position}`) : null;
    });

    const showPromo = computed(
        () =>
            !!space.value &&
            space.value.type !== 'list' &&
            !promoDismissed.value &&
            space.value.items.length > 0
    );

    function onAdd(raw: string) {
        if (!space.value) return;
        const item = store.addItemSmart(space.value.id, raw);
        if (item) lastZoneId.value = item.zoneId;
    }
    function onRemove(id: string) {
        if (space.value) store.removeItem(space.value.id, id);
        if (selectedId.value === id) selectedId.value = null;
    }
    function onSelect(id: string) {
        selectedId.value = id;
    }
    function closeDetail() {
        selectedId.value = null;
    }
    function onSetView(mode: ViewMode) {
        if (space.value) store.setViewMode(space.value.id, mode);
    }
    function onOpenLayout() {
        if (space.value) store.setViewMode(space.value.id, 'layout');
    }
    function dismissPromo() {
        promoDismissed.value = true;
    }
    function onPhotoLocked() {
        // Phase 7 opens the paywall (reason: photos) here.
    }
</script>
