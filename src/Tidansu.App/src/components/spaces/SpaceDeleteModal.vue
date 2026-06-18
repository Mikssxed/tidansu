<template>
    <BaseModal
        :open="open"
        max-width="440px"
        @close="onClose"
    >
        <h2 class="text-[19px] font-bold">Delete space?</h2>
        <p class="mt-2 text-[14px] leading-relaxed text-text-2">
            <span class="font-semibold text-text">{{ name }}</span> and its
            {{ itemsLabel }} will be permanently removed. This can't be undone.
        </p>
        <div class="mt-5 flex justify-end gap-2">
            <BaseButton
                variant="ghost"
                @click="onClose"
            >
                Cancel
            </BaseButton>
            <BaseButton
                variant="danger"
                @click="onConfirm"
            >
                Delete space
            </BaseButton>
        </div>
    </BaseModal>
</template>

<script setup lang="ts">
    import { BaseButton, BaseModal } from '@/components/base';
    import { computed } from 'vue';

    interface Props {
        open: boolean;
        name: string;
        itemCount: number;
    }

    const props = defineProps<Props>();
    const emit = defineEmits<{ close: []; confirm: [] }>();

    const itemsLabel = computed(
        () => `${props.itemCount} ${props.itemCount === 1 ? 'item' : 'items'}`
    );

    function onClose() {
        emit('close');
    }
    function onConfirm() {
        emit('confirm');
    }
</script>
