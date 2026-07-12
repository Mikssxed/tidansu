<template>
    <BaseModal
        :open="open"
        max-width="520px"
        @close="onCancel"
    >
        <div class="flex items-center gap-2">
            <BaseIcon
                name="sparkle"
                :size="18"
                class="text-pro"
            />
            <h2 class="text-[18px] font-bold text-text">{{ heading }}</h2>
        </div>
        <p class="mt-1.5 text-[14px] text-text-2">{{ intro }}</p>

        <!-- Mandatory pre-purchase disclosures -->
        <dl class="mt-5 flex flex-col divide-y divide-border-faint rounded-card border border-border bg-surface-2">
            <div
                v-for="row in disclosures"
                :key="row.key"
                class="flex items-start justify-between gap-4 px-4 py-3"
            >
                <dt class="text-[13px] font-medium text-text-3">{{ row.label }}</dt>
                <dd class="text-right text-[13px] text-text">{{ row.value }}</dd>
            </div>
        </dl>

        <!-- Legal pages -->
        <ul class="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
            <li
                v-for="link in legalLinks"
                :key="link.key"
            >
                <a
                    :href="link.href"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-[13px] text-text-2 underline decoration-border-strong underline-offset-2 transition-colors hover:text-text"
                >
                    {{ link.label }}
                    <BaseIcon
                        name="arrowR"
                        :size="12"
                    />
                </a>
            </li>
        </ul>

        <!-- Express consent + withdrawal-right acknowledgement -->
        <label
            class="mt-5 flex cursor-pointer items-start gap-3 rounded-ctrl border bg-surface-2 p-3 transition-colors"
            :class="consentRowClass"
        >
            <input
                type="checkbox"
                class="mt-0.5 size-4 shrink-0 cursor-pointer accent-pro"
                :checked="consented"
                @change="onToggleConsent"
            />
            <span class="text-[13px] leading-relaxed text-text-2">{{ consentText }}</span>
        </label>

        <div class="mt-5 flex flex-wrap justify-end gap-2.5">
            <BaseButton
                variant="secondary"
                @click="onCancel"
            >
                Cancel
            </BaseButton>
            <BaseButton
                variant="primary"
                :disabled="payDisabled"
                @click="onConfirm"
            >
                <BaseIcon
                    name="sparkle"
                    :size="16"
                />
                {{ payLabel }}
            </BaseButton>
        </div>
    </BaseModal>
</template>

<script setup lang="ts">
    import { BaseButton, BaseIcon } from '@/components/base';
    import BaseModal from '@/components/base/BaseModal.vue';
    import { planOf } from '@/data/plans';
    import { computed, ref, watch } from 'vue';

    /**
     * Pre-Checkout consumer-law consent step (FR-11). Shown behind the
     * `checkoutConsentEnabled` flag before redirecting to Stripe Checkout: renders
     * the mandatory pre-purchase disclosures, links the legal pages, and gates a
     * "Subscribe & pay" obligation-to-pay button behind an explicit consent to
     * immediate provision + acknowledgement of losing the 14-day withdrawal right.
     *
     * Copy/routes are placeholders — final legal wording is a downstream task; what
     * B-6 delivers is the step and its gating logic. `confirm` fires only once
     * consent is captured, so the caller proceeds to Checkout.
     */
    interface Props {
        open: boolean;
    }

    const props = defineProps<Props>();
    const emit = defineEmits<{ confirm: []; close: [] }>();

    const consented = ref(false);

    // Reset consent every time the step is reopened — express consent must be
    // freshly given per purchase, never carried over from a previous attempt.
    watch(
        () => props.open,
        (isOpen) => {
            if (!isOpen) consented.value = false;
        }
    );

    const proPlan = computed(() => planOf('pro'));

    // The billing seam charges a SINGLE Stripe price (ProPriceId) with no notion of a
    // billing period, so the pre-purchase disclosure must state exactly ONE price — a
    // period-specific month/year figure here could differ from what Stripe charges, which
    // is a consumer-law problem.
    // TODO(go-live): this amount/currency is a placeholder from the static plans table.
    // Before VITE_CHECKOUT_CONSENT is enabled, source the real figure from the actual
    // Stripe price behind ProPriceId (or pass it in) so the disclosure matches the charge.
    const totalLabel = computed(() => `$${proPlan.value.priceM} / month`);

    const renewalLabel = 'Renews automatically each billing period until cancelled.';

    const heading = computed(() => `Subscribe to ${proPlan.value.name}`);

    const intro =
        'Please review the details below and confirm your consent before payment. Amounts are shown including VAT where applicable.';

    const disclosures = computed(() => [
        { key: 'price', label: 'Total, incl. VAT', value: totalLabel.value },
        { key: 'renewal', label: 'Renewal', value: renewalLabel },
        {
            key: 'seller',
            label: 'Sold by',
            value: 'Tidansu — seller identity finalized before go-live',
        },
        {
            key: 'cancel',
            label: 'Cancel / withdraw',
            value: 'Cancel anytime in Account; you keep Pro until the paid period ends.',
        },
    ]);

    const legalLinks = [
        { key: 'terms', label: 'Terms (Regulamin)', href: '/legal/terms' },
        { key: 'privacy', label: 'Privacy', href: '/legal/privacy' },
        { key: 'withdrawal', label: 'Withdrawal & Refunds', href: '/legal/withdrawal' },
        { key: 'imprint', label: 'Imprint', href: '/legal/imprint' },
    ];

    const consentText =
        'I ask Tidansu to start my Pro subscription immediately, and I acknowledge that by doing so I lose my 14-day right of withdrawal once the service has been fully provided.';

    const payLabel = 'Subscribe & pay';

    const payDisabled = computed(() => !consented.value);

    const consentRowClass = computed(() =>
        consented.value ? 'border-pro/50' : 'border-border hover:border-border-strong'
    );

    function onToggleConsent(event: Event) {
        consented.value = (event.target as HTMLInputElement).checked;
    }

    function onConfirm() {
        if (!consented.value) return;
        emit('confirm');
    }

    function onCancel() {
        emit('close');
    }
</script>
