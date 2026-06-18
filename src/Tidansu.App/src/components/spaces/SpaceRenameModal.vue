<template>
    <BaseModal
        :open="open"
        max-width="420px"
        @close="onClose"
    >
        <h2 class="text-[19px] font-bold">Rename space</h2>
        <form
            class="mt-4"
            @submit.prevent="save"
        >
            <input
                ref="input"
                v-model="name"
                type="text"
                class="h-11 w-full rounded-ctrl border border-border bg-surface-2 px-3.5 text-[15px] text-text placeholder:text-text-3 focus:border-border-strong focus:outline-none"
                placeholder="Space name"
            />
            <div class="mt-5 flex justify-end gap-2">
                <BaseButton
                    variant="ghost"
                    @click="onClose"
                >
                    Cancel
                </BaseButton>
                <BaseButton
                    type="submit"
                    :disabled="!canSave"
                >
                    Save
                </BaseButton>
            </div>
        </form>
    </BaseModal>
</template>

<script setup lang="ts">
    import { BaseButton, BaseModal } from '@/components/base';
    import { computed, nextTick, ref, watch } from 'vue';

    interface Props {
        open: boolean;
        initialName: string;
    }

    const props = defineProps<Props>();
    const emit = defineEmits<{ close: []; save: [name: string] }>();

    const name = ref(props.initialName);
    const input = ref<HTMLInputElement | null>(null);
    const canSave = computed(() => name.value.trim().length > 0);

    watch(
        () => props.open,
        async (isOpen) => {
            if (isOpen) {
                name.value = props.initialName;
                await nextTick();
                input.value?.focus();
                input.value?.select();
            }
        }
    );

    function save() {
        const next = name.value.trim();
        if (next) emit('save', next);
    }

    function onClose() {
        emit('close');
    }
</script>
