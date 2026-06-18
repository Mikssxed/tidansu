<template>
    <Teleport to="body">
        <Transition name="modal">
            <div
                v-if="open"
                class="fixed inset-0 z-50 flex items-center justify-center p-4"
                @click.self="onBackdrop"
            >
                <div
                    class="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
                    aria-hidden="true"
                />
                <div
                    class="elev-modal relative w-full rounded-xl2 border border-border bg-surface p-[calc(20px*var(--pad))]"
                    :style="{ maxWidth: maxWidth }"
                    role="dialog"
                    aria-modal="true"
                >
                    <slot />
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
    interface BaseModalProps {
        open: boolean;
        maxWidth?: string;
        /** When false, clicking the backdrop will not close. */
        dismissable?: boolean;
    }

    const props = withDefaults(defineProps<BaseModalProps>(), {
        maxWidth: '440px',
        dismissable: true,
    });

    const emit = defineEmits<{ close: [] }>();

    function onBackdrop() {
        if (props.dismissable) emit('close');
    }
</script>

<style scoped>
    .modal-enter-active,
    .modal-leave-active {
        transition: opacity 0.18s ease;
    }
    .modal-enter-from,
    .modal-leave-to {
        opacity: 0;
    }
</style>
