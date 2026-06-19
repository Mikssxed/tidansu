<template>
    <BaseModal
        :open="open"
        max-width="440px"
        @close="onClose"
    >
        <h2 class="text-[19px] font-bold">{{ title }}</h2>

        <form
            class="mt-4 flex flex-col gap-4"
            @submit.prevent="submit"
        >
            <div>
                <label
                    for="item-name"
                    class="mb-1.5 block text-[13px] text-text-2"
                >
                    Name
                </label>
                <input
                    id="item-name"
                    ref="nameInput"
                    v-model="name"
                    type="text"
                    placeholder="Item name"
                    class="h-11 w-full rounded-ctrl border border-border bg-surface-2 px-3.5 text-[15px] text-text placeholder:text-text-3 focus:border-border-strong focus:outline-none"
                />
            </div>

            <div>
                <label class="mb-1.5 block text-[13px] text-text-2">Icon</label>
                <div class="flex flex-wrap gap-1.5">
                    <button
                        v-for="choice in iconChoices"
                        :key="choice.key"
                        type="button"
                        class="flex size-9 items-center justify-center rounded-ctrl border transition-colors"
                        :class="choice.class"
                        :title="choice.title"
                        :aria-label="choice.title"
                        @click="pickIcon(choice.value)"
                    >
                        <BaseIcon
                            :name="choice.icon"
                            :size="18"
                        />
                    </button>
                </div>
            </div>

            <div class="flex flex-wrap items-end gap-4">
                <div>
                    <label
                        for="item-qty"
                        class="mb-1.5 block text-[13px] text-text-2"
                    >
                        Quantity
                    </label>
                    <select
                        id="item-qty"
                        v-model.number="qty"
                        class="h-11 rounded-ctrl border border-border bg-surface-2 px-3 text-[14px] text-text focus:border-border-strong focus:outline-none"
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
                <div class="min-w-0 flex-1">
                    <label
                        for="item-expiry"
                        class="mb-1.5 block text-[13px] text-text-2"
                    >
                        Expiry date
                    </label>
                    <input
                        id="item-expiry"
                        v-model="expiryDate"
                        type="date"
                        class="h-11 w-full rounded-ctrl border border-border bg-surface-2 px-3 text-[14px] text-text focus:border-border-strong focus:outline-none"
                    />
                </div>
            </div>

            <div class="mt-1 flex justify-end gap-2">
                <BaseButton
                    variant="ghost"
                    @click="onClose"
                >
                    Cancel
                </BaseButton>
                <BaseButton
                    type="submit"
                    :disabled="!canSubmit"
                >
                    {{ submitLabel }}
                </BaseButton>
            </div>
        </form>
    </BaseModal>
</template>

<script setup lang="ts">
    import { BaseButton, BaseIcon, BaseModal } from '@/components/base';
    import { type IconName, ITEM_ICONS, itemIcon } from '@/components/icons';
    import type { Item } from '@/data/types';
    import { computed, nextTick, ref, watch } from 'vue';

    interface Props {
        open: boolean;
        mode: 'add' | 'edit';
        zoneLabel?: string;
        item?: Item | null;
    }

    const props = withDefaults(defineProps<Props>(), { zoneLabel: '', item: null });
    const emit = defineEmits<{
        close: [];
        submit: [payload: { name: string; icon: IconName | null; quantity: number; expiry: string | null }];
    }>();

    const QTY_OPTIONS = [1, 2, 3, 4, 6, 12, 24];

    const name = ref('');
    const qty = ref(1);
    /** null = use the auto icon derived from the name. */
    const selectedIcon = ref<IconName | null>(null);
    const expiryDate = ref(''); // yyyy-mm-dd
    const nameInput = ref<HTMLInputElement | null>(null);

    const title = computed(() => (props.mode === 'edit' ? 'Edit item' : `Add to ${props.zoneLabel}`));
    const submitLabel = computed(() => (props.mode === 'edit' ? 'Save' : 'Add'));
    const canSubmit = computed(() => name.value.trim().length > 0);

    const autoIcon = computed(() => itemIcon(name.value));

    const iconChoices = computed(() => [
        {
            key: 'auto',
            value: null as IconName | null,
            icon: autoIcon.value,
            title: 'Auto (from name)',
            class:
                selectedIcon.value === null
                    ? 'border-text bg-surface-3 text-text'
                    : 'border-border bg-surface-2 text-text-2 hover:text-text',
        },
        ...ITEM_ICONS.map((ic) => ({
            key: ic,
            value: ic as IconName | null,
            icon: ic,
            title: ic,
            class:
                selectedIcon.value === ic
                    ? 'border-text bg-surface-3 text-text'
                    : 'border-border bg-surface-2 text-text-2 hover:text-text',
        })),
    ]);

    watch(
        () => props.open,
        async (isOpen) => {
            if (!isOpen) return;
            const item = props.item;
            name.value = item?.name ?? '';
            qty.value = item?.quantity ?? 1;
            selectedIcon.value = item?.icon ?? null;
            expiryDate.value = item?.expiry ? item.expiry.slice(0, 10) : '';
            await nextTick();
            nameInput.value?.focus();
        }
    );

    function pickIcon(value: IconName | null) {
        selectedIcon.value = value;
    }

    function submit() {
        if (!canSubmit.value) return;
        emit('submit', {
            name: name.value.trim(),
            icon: selectedIcon.value,
            quantity: qty.value,
            expiry: expiryDate.value ? new Date(`${expiryDate.value}T00:00:00`).toISOString() : null,
        });
    }
    function onClose() {
        emit('close');
    }
</script>
