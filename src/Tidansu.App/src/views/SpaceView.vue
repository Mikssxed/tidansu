<template>
    <div
        v-if="space"
        class="mx-auto w-full max-w-[1240px] pt-6 sm:pt-8"
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
                @select="onSelect"
                @add="onLayoutAdd"
                @edit="startEditing"
            />
        </template>

        <ItemDetailModal
            :open="isDetailOpen"
            :item="selectedItem"
            :zone="selectedZone"
            :type="space.type"
            :can-photo="session.isPro"
            @close="closeDetail"
            @edit="onEditItem"
            @remove="onRemove"
            @photo-locked="onPhotoLocked"
        />

        <ItemFormModal
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
    import ItemFormModal from '@/components/space/ItemFormModal.vue';
    import ItemDetailModal from '@/components/space/ItemDetailModal.vue';
    import ItemList from '@/components/space/ItemList.vue';
    import LayoutView from '@/components/space/LayoutView.vue';
    import LayoutEditor from '@/components/space/editor/LayoutEditor.vue';
    import SeeAsLayoutPromo from '@/components/space/SeeAsLayoutPromo.vue';
    import SmartAdd from '@/components/space/SmartAdd.vue';
    import SpaceHeader from '@/components/space/SpaceHeader.vue';
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
    const viewMode = computed<ViewMode>(() => space.value?.viewMode ?? 'list');

    const selectedId = ref<string | null>(null);
    const lastZoneId = ref<string | null>(null);
    const promoDismissed = ref(false);
    const editing = ref(false);
    const addTarget = ref<{ zoneId: string; depth: ItemDepth; level: number } | null>(null);
    const editId = ref<string | null>(null);

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
        if (!space.value) return;
        if (!limits.guard(limits.checkAddItem(space.value))) return;
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
        // Close the item detail so the paywall sits cleanly on top (both teleport to body).
        selectedId.value = null;
        limits.openPaywall('photos');
    }

    // ---- layout view + editor ----
    function startEditing() {
        editing.value = true;
    }
    function stopEditing() {
        editing.value = false;
    }
    function onLayoutAdd(payload: { zoneId: string; depth: ItemDepth; level: number }) {
        addTarget.value = payload;
    }
    function onEditItem(id: string) {
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
        if (!space.value) return;
        if (!limits.guard(limits.checkAddZone(space.value))) return;
        store.addZoneColumn(space.value.id, column);
    }
    function onAddFreeZone(rect: Rect, kind: ZoneKind) {
        if (!space.value) return;
        if (!limits.guard(limits.checkAddZone(space.value))) return;
        store.addZoneFree(space.value.id, rect, kind);
    }
    function onUpdateZone(id: string, patch: Partial<Zone>) {
        if (space.value) store.updateZone(space.value.id, id, patch);
    }
    function onDeleteZone(id: string) {
        if (space.value) store.deleteZone(space.value.id, id);
    }
    function onConvert() {
        if (space.value) store.convertToFreeform(space.value.id);
    }
</script>
