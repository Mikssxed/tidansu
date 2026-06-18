<template>
    <div class="relative flex gap-4 rounded-card border border-border bg-surface p-4">
        <div class="hidden shrink-0 sm:block">
            <div class="grid size-20 grid-cols-3 grid-rows-3 gap-1">
                <i
                    v-for="cell in cells"
                    :key="cell.i"
                    class="rounded-[3px] border"
                    :class="cell.class"
                />
            </div>
        </div>
        <div class="min-w-0 flex-1">
            <div class="text-[15px] font-bold text-text">Want to see this as a layout?</div>
            <div class="mt-1 text-[13px] text-text-2">{{ description }}</div>
            <BaseButton
                variant="secondary"
                size="sm"
                class="mt-3"
                @click="onOpen"
            >
                <BaseIcon
                    name="grid"
                    :size="16"
                />
                Open layout view
            </BaseButton>
        </div>
        <button
            type="button"
            class="absolute right-2 top-2 flex size-7 items-center justify-center rounded-ctrl text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
            aria-label="Dismiss"
            @click="onDismiss"
        >
            <BaseIcon
                name="x"
                :size="16"
            />
        </button>
    </div>
</template>

<script setup lang="ts">
    import { BaseButton, BaseIcon } from '@/components/base';
    import { computed } from 'vue';

    const props = defineProps<{ itemCount: number }>();
    const emit = defineEmits<{ open: []; dismiss: [] }>();

    const cells = computed(() =>
        Array.from({ length: 9 }, (_, i) => ({
            i,
            class: i % 3 === 0 ? 'border-zone-blue/40 bg-zone-blue/20' : 'border-border-faint',
        }))
    );

    const description = computed(
        () =>
            `Arrange your ${props.itemCount} items spatially — shelf by shelf, slot by slot. Same data, nothing to re-enter.`
    );

    function onOpen() {
        emit('open');
    }
    function onDismiss() {
        emit('dismiss');
    }
</script>
