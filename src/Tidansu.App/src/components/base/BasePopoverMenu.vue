<template>
    <div
        ref="root"
        class="relative inline-block"
    >
        <button
            type="button"
            class="flex size-8 items-center justify-center rounded-ctrl text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
            :aria-label="label"
            aria-haspopup="menu"
            :aria-expanded="isOpen"
            @click.stop="toggle"
        >
            <slot name="trigger">
                <BaseIcon
                    name="dots"
                    :size="18"
                />
            </slot>
        </button>

        <Transition name="pop">
            <div
                v-if="isOpen"
                class="elev-menu absolute right-0 z-30 mt-1.5 min-w-44 overflow-hidden rounded-ctrl border border-border bg-surface-2 py-1"
                role="menu"
                @click="close"
            >
                <slot />
            </div>
        </Transition>
    </div>
</template>

<script setup lang="ts">
    import BaseIcon from '@/components/base/BaseIcon.vue';
    import { onBeforeUnmount, onMounted, ref } from 'vue';

    withDefaults(defineProps<{ label?: string }>(), { label: 'Open menu' });

    const isOpen = ref(false);
    const root = ref<HTMLElement | null>(null);

    function toggle() {
        isOpen.value = !isOpen.value;
    }
    function close() {
        isOpen.value = false;
    }
    function onDocClick(e: MouseEvent) {
        if (root.value && !root.value.contains(e.target as Node)) close();
    }

    onMounted(() => document.addEventListener('click', onDocClick));
    onBeforeUnmount(() => document.removeEventListener('click', onDocClick));
</script>

<style scoped>
    .pop-enter-active,
    .pop-leave-active {
        transition:
            opacity 0.14s ease,
            transform 0.14s ease;
    }
    .pop-enter-from,
    .pop-leave-to {
        opacity: 0;
        transform: translateY(-4px) scale(0.98);
    }
</style>
