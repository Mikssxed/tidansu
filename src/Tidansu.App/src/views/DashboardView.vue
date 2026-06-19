<template>
    <div class="mx-auto w-full max-w-[1240px]">
        <!-- Header -->
        <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
                <h1 class="text-[28px] font-bold">Your spaces</h1>
                <p class="mt-1 text-[14px] text-text-2">{{ subtitle }}</p>
            </div>
            <div class="flex items-center gap-4">
                <div class="hidden w-44 sm:block">
                    <UsageMeter
                        label="Spaces"
                        :used="store.count"
                        :cap="session.caps.spaces"
                    />
                </div>
                <BaseButton @click="goCreate">
                    <BaseIcon
                        name="plus"
                        :size="18"
                    />
                    New space
                </BaseButton>
            </div>
        </div>

        <!-- At-limit upsell banner -->
        <div
            v-if="atSpaceLimit"
            class="mt-6 flex flex-wrap items-center gap-3 rounded-card border border-warn/30 bg-warn/10 p-4"
        >
            <span class="flex size-8 shrink-0 items-center justify-center rounded-ctrl bg-warn/15 text-warn">
                <BaseIcon
                    name="sparkle"
                    :size="16"
                />
            </span>
            <p class="min-w-0 flex-1 text-[14px] text-text-2">
                <span class="font-semibold text-text">You're at the Free limit.</span>
                Upgrade to Pro for unlimited spaces, photos and sync across devices.
            </p>
            <BaseButton
                variant="secondary"
                size="sm"
                @click="goPricing"
            >
                Upgrade
                <BaseIcon
                    name="arrowR"
                    :size="15"
                />
            </BaseButton>
        </div>

        <!-- Empty state -->
        <BaseEmptyState
            v-if="store.count === 0"
            class="mt-10 rounded-card border border-border bg-surface"
            icon="cabinet"
            title="No spaces yet"
            description="Create your first space to start mapping what's inside — fridge, freezer, cellar or cabinet."
        >
            <template #action>
                <BaseButton @click="goCreate">Create a space</BaseButton>
            </template>
        </BaseEmptyState>

        <!-- Card grid -->
        <div
            v-else
            class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
            <SpaceCard
                v-for="space in store.spaces"
                :key="space.id"
                :space="space"
                @open="openSpace"
                @rename="onRename"
                @duplicate="onDuplicate"
                @delete="onDelete"
            />

            <!-- New space tile (locked affordance at the Free limit) -->
            <button
                type="button"
                class="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border-strong px-4 text-center text-text-2 transition-colors hover:border-text-3 hover:text-text"
                @click="goCreate"
            >
                <BaseIcon
                    :name="newTileIcon"
                    :size="22"
                />
                <span class="text-[14px] font-medium text-text">{{ newTileTitle }}</span>
                <span class="text-[12px] text-text-3">{{ newTileDesc }}</span>
            </button>
        </div>

        <SpaceRenameModal
            :open="isRenameOpen"
            :initial-name="renameInitialName"
            @close="closeRename"
            @save="confirmRename"
        />
        <SpaceDeleteModal
            :open="isDeleteOpen"
            :name="deleteName"
            :item-count="deleteItemCount"
            @close="closeDelete"
            @confirm="confirmDelete"
        />
    </div>
</template>

<script setup lang="ts">
    import { BaseButton, BaseEmptyState, BaseIcon } from '@/components/base';
    import SpaceCard from '@/components/spaces/SpaceCard.vue';
    import SpaceDeleteModal from '@/components/spaces/SpaceDeleteModal.vue';
    import SpaceRenameModal from '@/components/spaces/SpaceRenameModal.vue';
    import UsageMeter from '@/components/spaces/UsageMeter.vue';
    import { useLimits } from '@/composables/useLimits';
    import { isInf } from '@/data/plans';
    import type { Space } from '@/data/types';
    import { useSessionStore } from '@/stores/useSessionStore';
    import { useSpacesStore } from '@/stores/useSpacesStore';
    import { computed, ref } from 'vue';
    import { useRouter } from 'vue-router';

    const store = useSpacesStore();
    const session = useSessionStore();
    const limits = useLimits();
    const router = useRouter();

    const renameTarget = ref<Space | null>(null);
    const deleteTarget = ref<Space | null>(null);

    const subtitle = computed(() => {
        const n = store.count;
        const spaces = `${n} ${n === 1 ? 'space' : 'spaces'}`;
        return session.user ? `${spaces} · ${session.user.name}` : spaces;
    });

    const atSpaceLimit = computed(
        () => !isInf(session.caps.spaces) && store.count >= session.caps.spaces
    );
    const newTileIcon = computed(() => (atSpaceLimit.value ? 'lock' : 'plus'));
    const newTileTitle = computed(() =>
        atSpaceLimit.value ? 'Upgrade for more spaces' : 'New space'
    );
    const newTileDesc = computed(() =>
        atSpaceLimit.value
            ? `You've used all ${session.caps.spaces} on Free`
            : 'Fridge, freezer, cabinet, cellar…'
    );

    const isRenameOpen = computed(() => renameTarget.value !== null);
    const renameInitialName = computed(() => renameTarget.value?.name ?? '');
    const isDeleteOpen = computed(() => deleteTarget.value !== null);
    const deleteName = computed(() => deleteTarget.value?.name ?? '');
    const deleteItemCount = computed(() => deleteTarget.value?.items.length ?? 0);

    function goCreate() {
        if (!limits.guard(limits.checkAddSpace())) return;
        router.push({ name: 'spacesNew' });
    }

    function goPricing() {
        router.push({ name: 'pricing' });
    }

    function openSpace(id: string) {
        store.currentId = id;
        router.push({ name: 'space', params: { id } });
    }

    function onRename(id: string) {
        renameTarget.value = store.getById(id);
    }

    function onDuplicate(id: string) {
        if (!limits.guard(limits.checkAddSpace())) return;
        store.duplicateSpace(id);
    }

    function onDelete(id: string) {
        deleteTarget.value = store.getById(id);
    }

    function closeRename() {
        renameTarget.value = null;
    }

    function closeDelete() {
        deleteTarget.value = null;
    }

    function confirmRename(name: string) {
        if (renameTarget.value) store.renameSpace(renameTarget.value.id, name);
        renameTarget.value = null;
    }

    function confirmDelete() {
        if (deleteTarget.value) store.deleteSpace(deleteTarget.value.id);
        deleteTarget.value = null;
    }
</script>
