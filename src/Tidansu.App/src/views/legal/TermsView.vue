<template>
    <div class="mx-auto w-full max-w-[720px] pb-16">
        <div class="pt-2">
            <RouterLink
                :to="{ name: 'landing' }"
                class="inline-flex items-center gap-1.5 text-[14px] text-text-2 transition-colors hover:text-text"
            >
                <BaseIcon
                    name="arrowL"
                    :size="15"
                />
                Back
            </RouterLink>
        </div>

        <BaseCard
            large
            class="mt-6 p-[calc(26px*var(--pad))]"
        >
            <LegalTermsContent />
        </BaseCard>
    </div>
</template>

<script setup lang="ts">
    import { BaseCard, BaseIcon } from '@/components/base';
    import LegalTermsContent from '@/components/legal/LegalTermsContent.vue';
</script>
