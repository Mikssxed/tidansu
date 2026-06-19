<template>
    <BaseModal
        :open="open"
        max-width="460px"
        @close="onClose"
    >
        <div v-if="item">
            <button
                type="button"
                class="absolute right-4 top-4 flex size-8 items-center justify-center rounded-ctrl text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
                aria-label="Close"
                @click="onClose"
            >
                <BaseIcon
                    name="x"
                    :size="16"
                />
            </button>

            <div class="flex items-start gap-3 pr-9">
                <span class="flex size-11 shrink-0 items-center justify-center rounded-ctrl bg-surface-2 text-text-2">
                    <BaseIcon
                        :name="iconName"
                        :size="22"
                    />
                </span>
                <div class="min-w-0 flex-1">
                    <h2 class="text-[19px] font-bold text-text">{{ item.name }}</h2>
                    <p class="text-[13px] text-text-3">{{ qtyLabel }}</p>
                </div>
            </div>

            <div class="mt-4 flex gap-2">
                <BaseButton
                    variant="secondary"
                    size="sm"
                    @click="onEdit"
                >
                    <BaseIcon
                        name="edit"
                        :size="15"
                    />
                    Edit
                </BaseButton>
                <BaseButton
                    variant="secondary"
                    size="sm"
                    @click="onRemove"
                >
                    <BaseIcon
                        name="trash"
                        :size="15"
                    />
                    Remove
                </BaseButton>
            </div>

            <dl class="mt-5 flex flex-col gap-2.5">
                <div
                    v-if="zonePillName"
                    class="flex items-center justify-between"
                >
                    <dt class="text-[13px] text-text-3">Zone</dt>
                    <dd class="inline-flex items-center gap-1.5 text-[14px] text-text">
                        <span
                            class="size-2 rounded-[3px]"
                            :class="accentClass"
                        />
                        {{ zonePillName }}
                    </dd>
                </div>
                <div class="flex items-center justify-between">
                    <dt class="text-[13px] text-text-3">Expiry</dt>
                    <dd class="text-[14px] text-text">
                        <ItemExpiry
                            v-if="item.expiry"
                            :iso="item.expiry"
                        />
                        <span
                            v-else
                            class="text-text-3"
                        >
                            none
                        </span>
                    </dd>
                </div>
                <div class="flex items-center justify-between">
                    <dt class="text-[13px] text-text-3">Added</dt>
                    <dd class="text-[14px] text-text">{{ addedLabel }}</dd>
                </div>
            </dl>

            <!-- photo slot (Pro-gated) -->
            <button
                type="button"
                class="mt-5 flex w-full items-center justify-center gap-2 rounded-ctrl border border-dashed border-border-strong py-6 text-text-2 transition-colors hover:text-text"
                @click="onPhotoClick"
            >
                <BaseIcon
                    :name="photoIcon"
                    :size="18"
                />
                {{ photoLabel }}
                <BaseBadge
                    v-if="photoLocked"
                    variant="pro"
                >
                    Pro
                </BaseBadge>
            </button>
        </div>
    </BaseModal>
</template>

<script setup lang="ts">
    import { BaseBadge, BaseButton, BaseIcon, BaseModal } from '@/components/base';
    import { itemIcon } from '@/components/icons';
    import ItemExpiry from '@/components/space/ItemExpiry.vue';
    import { zoneBgClasses } from '@/composables/useColorVariant';
    import { zoneName } from '@/data/spaces';
    import type { Item, SpaceTypeId, Zone } from '@/data/types';
    import { computed } from 'vue';

    interface Props {
        open: boolean;
        item: Item | null;
        zone: Zone | null;
        type: SpaceTypeId;
        canPhoto: boolean;
    }

    const props = defineProps<Props>();
    const emit = defineEmits<{
        close: [];
        edit: [id: string];
        remove: [id: string];
        photoLocked: [];
        addPhoto: [id: string];
    }>();

    const iconName = computed(() =>
        props.item ? (props.item.icon ?? itemIcon(props.item.name)) : 'package'
    );
    const qtyLabel = computed(() => (props.item ? `Quantity ×${props.item.quantity}` : ''));
    const accentClass = computed(() => (props.zone ? zoneBgClasses[props.zone.color] : 'bg-zone-gray'));
    const zonePillName = computed(() => (props.zone ? zoneName(props.zone, props.type) : ''));
    const addedLabel = computed(() =>
        props.item
            ? new Date(props.item.dateAdded).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
              })
            : ''
    );

    const photoLocked = computed(() => !props.canPhoto);
    const photoIcon = computed(() => (photoLocked.value ? 'lock' : 'plus'));
    const photoLabel = computed(() => (photoLocked.value ? 'Add a photo' : 'Add a photo'));

    function onClose() {
        emit('close');
    }
    function onEdit() {
        if (props.item) emit('edit', props.item.id);
    }
    function onRemove() {
        if (props.item) emit('remove', props.item.id);
    }
    function onPhotoClick() {
        if (photoLocked.value) emit('photoLocked');
        else if (props.item) emit('addPhoto', props.item.id);
    }
</script>
