<template>
    <div class="mx-auto w-full max-w-[1240px] pt-6 sm:pt-8">
        <SpaceHeader
            v-if="space"
            :space="space"
            :view-mode="viewMode"
            @set-view="onSetView"
        />

        <!-- B-17: over-cap space after a downgrade — content can't be changed. -->
        <div
            v-if="readOnly"
            class="mt-4"
        >
            <SpaceReadonlyBadge />
        </div>

        <!-- Contents still loading (B-16 FR-5) — must never be mistaken for the empty state -->
        <div
            v-if="isLoadingContents"
            class="mt-10 flex flex-col items-center py-10 text-center"
        >
            <BaseIcon
                name="cabinet"
                :size="28"
                class="animate-pulse text-text-2"
            />
            <p class="mt-4 text-[14px] text-text-2">Loading…</p>
        </div>

        <!-- Contents failed to load (review N1) — distinct from both loading and empty -->
        <BaseEmptyState
            v-else-if="loadFailed"
            class="mt-10"
            icon="restart"
            title="Couldn't load this space"
            description="Something went wrong loading its contents. Check your connection and try again."
        >
            <template #action>
                <BaseButton
                    size="sm"
                    @click="onRetry"
                >
                    Retry
                </BaseButton>
            </template>
        </BaseEmptyState>

        <template v-else-if="space">
            <!-- List view -->
            <div v-if="viewMode === 'list'">
                <div
                    v-if="!readOnly"
                    class="mt-6"
                >
                    <SmartAdd
                        :last-zone-name="lastZoneName"
                        @add="onAdd"
                    />
                </div>

                <ItemList
                    :space="space"
                    :read-only="readOnly"
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

            <!-- Layout view + editor -->
            <template v-else>
                <LayoutEditor
                    v-if="editing"
                    :space="space"
                    @done="stopEditing"
                    @add-column-zone="onAddColumnZone"
                    @add-free-zone="onAddFreeZone"
                    @update-zone="onUpdateZone"
                    @delete-zone="onDeleteZone"
                    @convert="onConvert"
                />
                <LayoutView
                    v-else
                    :space="space"
                    :selected-id="selectedId"
                    :read-only="readOnly"
                    @select="onSelect"
                    @add="onLayoutAdd"
                    @edit="startEditing"
                />
            </template>
        </template>

        <ItemDetailModal
            v-if="space"
            :open="isDetailOpen"
            :item="selectedItem"
            :zone="selectedZone"
            :type="space.type"
            :can-photo="session.isPro"
            :can-edit="!readOnly"
            @close="closeDetail"
            @edit="onEditItem"
            @remove="onRemove"
            @photo-locked="onPhotoLocked"
        />

        <ItemFormModal
            v-if="space"
            :open="isFormOpen"
            :mode="formMode"
            :zone-label="addZoneLabel"
            :item="formItem"
            @close="closeForm"
            @submit="onFormSubmit"
        />
    </div>
</template>

<script setup lang="ts">
    import { BaseButton, BaseEmptyState, BaseIcon } from '@/components/base';
    import ItemFormModal from '@/components/space/ItemFormModal.vue';
    import ItemDetailModal from '@/components/space/ItemDetailModal.vue';
    import ItemList from '@/components/space/ItemList.vue';
    import LayoutView from '@/components/space/LayoutView.vue';
    import LayoutEditor from '@/components/space/editor/LayoutEditor.vue';
    import SeeAsLayoutPromo from '@/components/space/SeeAsLayoutPromo.vue';
    import SmartAdd from '@/components/space/SmartAdd.vue';
    import SpaceHeader from '@/components/space/SpaceHeader.vue';
    import SpaceReadonlyBadge from '@/components/spaces/SpaceReadonlyBadge.vue';
    import type { IconName } from '@/components/icons';
    import { useLimits } from '@/composables/useLimits';
    import { zoneName } from '@/data/spaces';
    import type { ItemDepth, Rect, ViewMode, Zone, ZoneKind } from '@/data/types';
    import { useSessionStore } from '@/stores/useSessionStore';
    import { useSpacesStore } from '@/stores/useSpacesStore';
    import { computed, ref, watch } from 'vue';
    import { useRouter } from 'vue-router';

    const props = defineProps<{ id: string }>();

    const store = useSpacesStore();
    const session = useSessionStore();
    const limits = useLimits();
    const router = useRouter();

    const space = computed(() => store.getById(props.id));
    // B-17: live over-cap flag — never a snapshot, re-derives on downgrade/upgrade/
    // add/delete via `limits.readonlySpaceIds`.
    const readOnly = computed(() => limits.isSpaceReadOnly(props.id));
    const viewMode = computed<ViewMode>(() => space.value?.viewMode ?? 'list');
    // B-16 FR-5: a space's contents load lazily on open — this must render as an
    // explicit loading state, distinct from the genuine "no zones yet" empty state
    // that `ItemList`/`LayoutView` render once contents are loaded. `loadFailed`
    // (review N1) is driven off the store's real failed-fetch flag so a transient
    // error surfaces a retry affordance instead of an infinite spinner.
    const showContents = computed(() => store.isContentsLoaded(props.id));
    const loadFailed = computed(() => store.isContentsFailed(props.id));
    const isLoadingContents = computed(() => !showContents.value && !loadFailed.value);

    const selectedId = ref<string | null>(null);
    const lastZoneId = ref<string | null>(null);
    const promoDismissed = ref(false);
    const editing = ref(false);
    const addTarget = ref<{ zoneId: string; depth: ItemDepth; level: number } | null>(null);
    const editId = ref<string | null>(null);
    // The last id `space` was known non-null for — disambiguates "not loaded yet"
    // (e.g. the M1 deep-link fetch below still in flight) from "was open, now gone"
    // (e.g. deleted in another session) so only the latter bounces to the dashboard.
    const lastKnownId = ref<string | null>(null);

    // Track the open space: mark it current once known. If the space we were viewing
    // vanishes from the store without the route changing, bounce to the dashboard.
    watch(
        space,
        (value) => {
            if (value) {
                store.currentId = value.id;
                lastKnownId.value = value.id;
            } else if (lastKnownId.value === props.id) {
                router.replace({ name: 'spaces' });
            }
        },
        { immediate: true }
    );

    // Fetch this space's full (photo-less) contents on open (B-16 FR-2). B-16 M1: when
    // the routed id isn't among the loaded summary pages (a deep-link or refresh to a
    // space beyond page 1), the store fetches it directly and inserts it rather than
    // leaving `space` unknown — only a confirmed 404 redirects to the dashboard here;
    // any other failure surfaces as the `loadFailed` state above.
    watch(
        () => props.id,
        async (id) => {
            const result = await store.loadSpaceContents(id);
            if (result === 'not-found') router.replace({ name: 'spaces' });
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

    const isFormOpen = computed(() => addTarget.value !== null || editId.value !== null);
    const formMode = computed<'add' | 'edit'>(() => (editId.value !== null ? 'edit' : 'add'));
    const formItem = computed(
        () => space.value?.items.find((it) => it.id === editId.value) ?? null
    );
    const addZoneLabel = computed(() => {
        const zone = space.value?.zones.find((z) => z.id === addTarget.value?.zoneId);
        return zone && space.value ? zoneName(zone, space.value.type) : '';
    });

    function onAdd(raw: string) {
        if (readOnly.value) return;
        if (!space.value) return;
        if (!limits.guard(limits.checkAddItem(space.value))) return;
        const item = store.addItemSmart(space.value.id, raw);
        if (item) lastZoneId.value = item.zoneId;
    }
    function onRemove(id: string) {
        if (readOnly.value) return;
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
        // Close the item detail so the paywall sits cleanly on top (both teleport to body).
        selectedId.value = null;
        limits.openPaywall('photos');
    }
    function onRetry() {
        void store.loadSpaceContents(props.id);
    }

    // ---- layout view + editor ----
    function startEditing() {
        if (readOnly.value) return;
        editing.value = true;
    }
    function stopEditing() {
        editing.value = false;
    }
    function onLayoutAdd(payload: { zoneId: string; depth: ItemDepth; level: number }) {
        addTarget.value = payload;
    }
    function onEditItem(id: string) {
        if (readOnly.value) return;
        selectedId.value = null; // close the detail so the form sits cleanly on top
        editId.value = id;
    }
    function closeForm() {
        addTarget.value = null;
        editId.value = null;
    }
    function onFormSubmit(payload: {
        name: string;
        icon: IconName | null;
        quantity: number;
        expiry: string | null;
    }) {
        if (!space.value) return;

        // Edit existing item.
        if (editId.value) {
            store.updateItem(space.value.id, editId.value, {
                name: payload.name,
                icon: payload.icon,
                quantity: payload.quantity,
                expiry: payload.expiry,
            });
            editId.value = null;
            return;
        }

        // Add new item into the targeted zone/slot.
        const target = addTarget.value;
        if (!target) return;
        if (readOnly.value) {
            addTarget.value = null;
            return;
        }
        if (!limits.guard(limits.checkAddItem(space.value))) {
            addTarget.value = null;
            return;
        }
        const item = store.addItemStructured(
            space.value.id,
            payload.name,
            target.zoneId,
            payload.quantity
        );
        if (item)
            store.updateItem(space.value.id, item.id, {
                icon: payload.icon,
                expiry: payload.expiry,
                depth: target.depth,
                level: target.level,
            });
        addTarget.value = null;
    }
    function onAddColumnZone(column: number) {
        if (readOnly.value) return;
        if (!space.value) return;
        if (!limits.guard(limits.checkAddZone(space.value))) return;
        store.addZoneColumn(space.value.id, column);
    }
    function onAddFreeZone(rect: Rect, kind: ZoneKind) {
        if (readOnly.value) return;
        if (!space.value) return;
        if (!limits.guard(limits.checkAddZone(space.value))) return;
        store.addZoneFree(space.value.id, rect, kind);
    }
    function onUpdateZone(id: string, patch: Partial<Zone>) {
        if (readOnly.value) return;
        if (space.value) store.updateZone(space.value.id, id, patch);
    }
    function onDeleteZone(id: string) {
        if (readOnly.value) return;
        if (space.value) store.deleteZone(space.value.id, id);
    }
    function onConvert() {
        if (readOnly.value) return;
        if (space.value) store.convertToFreeform(space.value.id);
    }
</script>
