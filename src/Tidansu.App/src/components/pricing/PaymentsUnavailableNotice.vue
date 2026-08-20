<template>
    <div
        class="flex items-start gap-2.5 rounded-card border border-border-strong bg-surface-2 px-4 py-3"
        role="status"
    >
        <BaseIcon
            name="lock"
            :size="16"
            class="mt-0.5 shrink-0 text-text-3"
        />
        <div class="min-w-0">
            <p class="text-[14px] font-medium text-text">{{ title }}</p>
            <p class="mt-0.5 text-[13px] leading-relaxed text-text-2">{{ body }}</p>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { BaseIcon } from '@/components/base';

    /**
     * Up-front notice that Pro can't be bought yet. Shown wherever an upgrade CTA
     * lives while `paymentsEnabled` is OFF, so the user learns it here instead of
     * from a 503 after clicking.
     */
    interface Props {
        /** Compact single-line variant for tight spots (account plan card). */
        title?: string;
        body?: string;
    }

    withDefaults(defineProps<Props>(), {
        title: 'Pro isn’t available to buy yet',
        body: 'Payments aren’t switched on — upgrading is disabled for now. Everything on the Free plan works as normal, and we’ll open Pro once checkout is live.',
    });
</script>
