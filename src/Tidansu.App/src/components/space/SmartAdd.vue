<template>
    <div>
        <div class="flex gap-2">
            <div class="flex h-11 flex-1 items-center gap-2 rounded-ctrl border border-border bg-surface-2 px-3 focus-within:border-border-strong">
                <BaseIcon
                    name="plus"
                    :size="18"
                    class="shrink-0 text-text-3"
                />
                <input
                    ref="input"
                    v-model="val"
                    type="text"
                    class="h-full w-full bg-transparent text-[15px] text-text placeholder:text-text-3 focus:outline-none"
                    placeholder="Add item…  e.g. milk, top shelf"
                    @keydown.enter="submit"
                />
            </div>
            <button
                type="button"
                class="flex size-11 items-center justify-center rounded-ctrl border border-border bg-surface-2 text-text-2 transition-colors hover:text-text"
                aria-label="Scan barcode"
                @click="scan"
            >
                <BaseIcon
                    name="barcode"
                    :size="20"
                />
            </button>
            <BaseButton
                :disabled="addDisabled"
                @click="submit"
            >
                Add
            </BaseButton>
        </div>

        <div class="mt-2.5 flex flex-wrap items-center gap-2 text-[12px] text-text-3">
            <span>Try:</span>
            <button
                v-for="ex in EXAMPLES"
                :key="ex"
                type="button"
                class="rounded-chip border border-border bg-surface px-2.5 py-1 text-text-2 transition-colors hover:border-border-strong hover:text-text"
                @click="addExample(ex)"
            >
                {{ ex }}
            </button>
            <span
                v-if="lastZoneName"
                class="ml-auto"
            >
                last added to <b class="text-text-2">{{ lastZoneName }}</b>
            </span>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { BaseButton, BaseIcon } from '@/components/base';
    import { computed, ref } from 'vue';

    defineProps<{ lastZoneName: string | null }>();
    const emit = defineEmits<{ add: [raw: string] }>();

    const EXAMPLES = ['Butter, door', 'Eggs x12', 'Leftover soup, top shelf'];
    const SCAN_SAMPLES = [
        { name: 'Sparkling water', q: 6 },
        { name: 'Greek yogurt', q: 4 },
        { name: 'Cola 0.5L', q: 1 },
        { name: 'Hummus', q: 1 },
        { name: 'Smoked salmon', q: 1 },
    ];

    const val = ref('');
    const input = ref<HTMLInputElement | null>(null);
    const addDisabled = computed(() => val.value.trim().length === 0);

    function submit() {
        if (addDisabled.value) return;
        emit('add', val.value);
        val.value = '';
    }

    function addExample(ex: string) {
        emit('add', ex);
    }

    function scan() {
        const s = SCAN_SAMPLES[Math.floor(Math.random() * SCAN_SAMPLES.length)]!;
        val.value = s.q > 1 ? `${s.name} x${s.q}` : s.name;
        input.value?.focus();
    }
</script>
