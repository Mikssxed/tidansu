<template>
    <BaseModal
        :open="isPaywallOpen"
        max-width="420px"
        @close="onClose"
    >
        <button
            type="button"
            class="absolute right-4 top-4 flex size-8 items-center justify-center rounded-ctrl text-text-2 transition-colors hover:text-text"
            aria-label="Close"
            @click="onClose"
        >
            <BaseIcon
                name="x"
                :size="16"
            />
        </button>

        <div class="flex size-12 items-center justify-center rounded-ctrl bg-surface-2 text-text">
            <BaseIcon
                :name="info.icon"
                :size="24"
            />
        </div>

        <div class="mt-4">
            <BaseBadge variant="pro">
                <BaseIcon
                    name="sparkle"
                    :size="11"
                />
                Pro
            </BaseBadge>
        </div>

        <h2 class="mt-3 text-[20px] font-bold">{{ info.title }}</h2>
        <p class="mt-1.5 text-[14px] leading-relaxed text-text-2">{{ bodyText }}</p>

        <ul class="mt-5 flex flex-col gap-2.5">
            <li
                v-for="benefit in benefits"
                :key="benefit.label"
                class="flex items-center gap-2.5 text-[14px] text-text"
            >
                <span class="flex size-5 shrink-0 items-center justify-center rounded-chip bg-pro/15 text-pro">
                    <BaseIcon
                        name="check"
                        :size="13"
                    />
                </span>
                {{ benefit.label }}
            </li>
        </ul>

        <div class="mt-6 flex flex-col gap-2">
            <BaseButton
                class="w-full"
                @click="onSeePlans"
            >
                <BaseIcon
                    name="sparkle"
                    :size="17"
                />
                See Pro plans
            </BaseButton>
            <BaseButton
                variant="ghost"
                class="w-full"
                @click="onClose"
            >
                Not now
            </BaseButton>
        </div>

        <p class="mt-3 text-center text-[12px] text-text-3">
            From $4/mo billed yearly · cancel anytime
        </p>
    </BaseModal>
</template>

<script setup lang="ts">
    import { BaseBadge, BaseButton, BaseIcon, BaseModal } from '@/components/base';
    import { useLimits } from '@/composables/useLimits';
    import { PAYWALL, PAYWALL_BENEFITS } from '@/data/paywall';
    import { useSessionStore } from '@/stores/useSessionStore';
    import { computed } from 'vue';
    import { useRouter } from 'vue-router';

    const { paywallReason, isPaywallOpen, closePaywall } = useLimits();
    const session = useSessionStore();
    const router = useRouter();

    const benefits = PAYWALL_BENEFITS;

    // Fall back to the spaces copy so the modal always has content during the
    // close transition (when the reason has just been cleared).
    const info = computed(() => PAYWALL[paywallReason.value ?? 'spaces']);

    const limit = computed(() => {
        const cap = paywallReason.value ? session.caps[paywallReason.value] : 0;
        return typeof cap === 'number' ? cap : 0;
    });
    const bodyText = computed(() => info.value.body(limit.value));

    function onClose() {
        closePaywall();
    }
    function onSeePlans() {
        closePaywall();
        router.push({ name: 'pricing' });
    }
</script>
