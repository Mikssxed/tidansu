<template>
    <BaseModal
        :open="open"
        max-width="420px"
        @close="onClose"
    >
        <h2 class="text-[19px] font-bold">Add to {{ zoneLabel }}</h2>
        <form
            class="mt-4 flex flex-col gap-3"
            @submit.prevent="submit"
        >
            <input
                ref="input"
                v-model="name"
                type="text"
                placeholder="Item name"
                class="h-11 w-full rounded-ctrl border border-border bg-surface-2 px-3.5 text-[15px] text-text placeholder:text-text-3 focus:border-border-strong focus:outline-none"
            />
            <div class="flex items-center gap-3">
                <label
                    for="add-qty"
                    class="text-[13px] text-text-2"
                >
                    Quantity
                </label>
                <select
                    id="add-qty"
                    v-model.number="qty"
                    class="h-9 rounded-ctrl border border-border bg-surface-2 px-2 text-[14px] text-text focus:outline-none"
                >
                    <option
                        v-for="n in QTY_OPTIONS"
                        :key="n"
                        :value="n"
                    >
                        ×{{ n }}
                    </option>
                </select>
            </div>
            <div class="mt-2 flex justify-end gap-2">
                <BaseButton
                    variant="ghost"
                    @click="onClose"
                >
                    Cancel
                </BaseButton>
                <BaseButton
                    type="submit"
                    :disabled="!canAdd"
                >
                    Add
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
        zoneLabel: string;
    }

    const props = defineProps<Props>();
    const emit = defineEmits<{ close: []; add: [payload: { name: string; qty: number }] }>();

    const QTY_OPTIONS = [1, 2, 3, 4, 6, 12, 24];

    const name = ref('');
    const qty = ref(1);
    const input = ref<HTMLInputElement | null>(null);
    const canAdd = computed(() => name.value.trim().length > 0);

    watch(
        () => props.open,
        async (isOpen) => {
            if (isOpen) {
                name.value = '';
                qty.value = 1;
                await nextTick();
                input.value?.focus();
            }
        }
    );

    function submit() {
        if (!canAdd.value) return;
        emit('add', { name: name.value.trim(), qty: qty.value });
    }
    function onClose() {
        emit('close');
    }
</script>
