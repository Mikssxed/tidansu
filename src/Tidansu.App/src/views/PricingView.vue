<template>
    <div class="mx-auto w-full max-w-[940px]">
        <div class="pt-2">
            <button
                type="button"
                class="inline-flex items-center gap-1.5 text-[14px] text-text-2 transition-colors hover:text-text"
                @click="goBack"
            >
                <BaseIcon
                    name="arrowL"
                    :size="15"
                />
                Back
            </button>
        </div>

        <!-- Hero -->
        <div class="mt-6 text-center">
            <p class="eyebrow">Plans</p>
            <h1 class="mx-auto mt-2 max-w-[640px] text-[30px] font-bold leading-tight">
                Simple pricing. Lift the limits when you're ready.
            </h1>
            <p class="mx-auto mt-3 max-w-[560px] text-[15px] text-text-2">
                Start free with two spaces. Upgrade to Pro for unlimited everything, item photos and
                sync across devices.
            </p>

            <div
                class="mx-auto mt-6 inline-flex rounded-ctrl border border-border bg-surface-2 p-0.5"
                role="group"
                aria-label="Billing period"
            >
                <button
                    type="button"
                    class="rounded-[8px] px-4 py-2 text-[14px] font-medium transition-colors"
                    :class="monthClass"
                    @click="setBilling('month')"
                >
                    Monthly
                </button>
                <button
                    type="button"
                    class="flex items-center gap-1.5 rounded-[8px] px-4 py-2 text-[14px] font-medium transition-colors"
                    :class="yearClass"
                    @click="setBilling('year')"
                >
                    Yearly
                    <span class="text-[12px] font-semibold text-pro">−20%</span>
                </button>
            </div>
        </div>

        <!-- Downgrade scheduled / billing notices -->
        <div
            v-if="showDowngradeNotice"
            class="mt-8 flex items-start gap-2.5 rounded-card border border-pro/30 bg-pro/5 px-4 py-3"
            role="status"
        >
            <BaseIcon
                name="sparkle"
                :size="16"
                class="mt-0.5 shrink-0 text-pro"
            />
            <p class="text-[14px] text-text">{{ downgradeNotice }}</p>
        </div>
        <div
            v-if="session.billingMessage"
            class="mt-8 flex items-start gap-2.5 rounded-card border border-warn/40 bg-warn/10 px-4 py-3"
            role="alert"
        >
            <BaseIcon
                name="lock"
                :size="16"
                class="mt-0.5 shrink-0 text-warn"
            />
            <p class="text-[14px] text-text">{{ session.billingMessage }}</p>
        </div>

        <!-- Plan cards -->
        <div class="mt-8 grid gap-4 sm:grid-cols-2">
            <PlanCard
                :plan="freePlan"
                :billing="billing"
                :current="isFreePlanCurrent"
                @choose="onDowngrade"
            />
            <PlanCard
                :plan="proPlan"
                :billing="billing"
                :current="isProPlanCurrent"
                @choose="onUpgrade"
            />
        </div>

        <!-- Comparison table -->
        <div class="mt-12">
            <h2 class="text-[18px] font-bold">Everything compared</h2>
            <div class="mt-4 overflow-hidden rounded-card border border-border">
                <table class="w-full text-[14px]">
                    <thead>
                        <tr class="border-b border-border bg-surface-2 text-left">
                            <th class="px-4 py-3 font-semibold text-text">Feature</th>
                            <th class="px-4 py-3 font-semibold text-text-2">Free</th>
                            <th class="bg-pro/5 px-4 py-3 font-semibold text-pro">Pro</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="row in comparison"
                            :key="row.key"
                            class="border-b border-border-faint last:border-0"
                        >
                            <td class="px-4 py-3 text-text">{{ row.label }}</td>
                            <td
                                class="px-4 py-3"
                                :class="row.freeClass"
                            >
                                {{ row.freeValue }}
                            </td>
                            <td class="bg-pro/5 px-4 py-3 text-text">{{ row.proValue }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- FAQ -->
        <div class="mb-4 mt-12 flex flex-col gap-5">
            <div
                v-for="faq in faqs"
                :key="faq.q"
            >
                <div class="text-[15px] font-semibold text-text">{{ faq.q }}</div>
                <p class="mt-1.5 text-[14px] leading-relaxed text-text-2">{{ faq.a }}</p>
            </div>
        </div>

        <CheckoutConsentStep
            :open="consentModal.isOpen.value"
            @confirm="onConsentConfirm"
            @close="onConsentClose"
        />
    </div>
</template>

<script setup lang="ts">
    import { BaseIcon } from '@/components/base';
    import CheckoutConsentStep from '@/components/pricing/CheckoutConsentStep.vue';
    import PlanCard from '@/components/pricing/PlanCard.vue';
    import { checkoutConsentEnabled } from '@/config/featureFlags';
    import { useModal } from '@/composables/useModal';
    import { PLAN_FEATURES, planOf } from '@/data/plans';
    import type { Plan } from '@/data/types';
    import { useSessionStore } from '@/stores/useSessionStore';
    import { computed, ref } from 'vue';
    import { useRouter } from 'vue-router';

    const session = useSessionStore();
    const router = useRouter();
    const consentModal = useModal();

    const billing = ref<'month' | 'year'>('year');
    const downgradeRequested = ref(false);

    const freePlan = computed(() => planOf('free'));
    const proPlan = computed(() => planOf('pro'));
    const currentPlan = computed<Plan>(() => session.plan);
    const isFreePlanCurrent = computed(() => currentPlan.value === 'free');
    const isProPlanCurrent = computed(() => currentPlan.value === 'pro');

    const monthClass = computed(() =>
        billing.value === 'month' ? 'bg-surface-3 text-text' : 'text-text-2 hover:text-text'
    );
    const yearClass = computed(() =>
        billing.value === 'year' ? 'bg-surface-3 text-text' : 'text-text-2 hover:text-text'
    );

    const comparison = computed(() =>
        PLAN_FEATURES.map((f) => {
            const freeValue = freePlan.value[f.key];
            return {
                key: f.key,
                label: f.label,
                freeValue: f.fmt(freeValue),
                freeClass: freeValue === false ? 'text-text-3' : 'text-text-2',
                proValue: f.fmt(proPlan.value[f.key]),
            };
        })
    );

    const faqs = [
        {
            q: 'What happens to my data if I downgrade?',
            a: 'Nothing is deleted. Spaces and items beyond the Free limits become read-only until you’re back under the cap or upgrade again.',
        },
        {
            q: 'Can I cancel anytime?',
            a: 'Yes — Pro is month-to-month or yearly. Cancel whenever; you keep Pro until the period ends.',
        },
    ];

    const downgradeNotice = computed(() => {
        if (!session.proAccessUntilLabel) return '';
        return `You’ll keep Pro until ${session.proAccessUntilLabel}, then switch to Free.`;
    });

    const showDowngradeNotice = computed(
        () => downgradeRequested.value && session.cancellationScheduled && downgradeNotice.value !== ''
    );

    function setBilling(value: 'month' | 'year') {
        billing.value = value;
    }

    function goBack() {
        returnToOrigin();
    }

    function returnToOrigin() {
        if (window.history.length > 1) router.back();
        else router.push({ name: 'spaces' });
    }

    function onUpgrade() {
        if (!session.isAuthenticated) {
            router.push({ name: 'login', query: { returnUrl: '/pricing' } });
            return;
        }
        // Gate Checkout behind the consumer-law consent step when the flag is on;
        // otherwise proceed straight to the billing seam (existing happy path).
        if (checkoutConsentEnabled) {
            consentModal.open();
            return;
        }
        void proceedUpgrade();
    }

    async function proceedUpgrade() {
        await session.setPlan('pro');
        // A billing error keeps the user here to read the surfaced message; on
        // success the seam either redirects to Checkout or the flip stands.
        if (session.billingMessage) return;
        returnToOrigin();
    }

    function onConsentConfirm() {
        consentModal.close();
        void proceedUpgrade();
    }

    function onConsentClose() {
        consentModal.close();
    }

    async function onDowngrade() {
        if (!session.isAuthenticated) {
            router.push({ name: 'login', query: { returnUrl: '/pricing' } });
            return;
        }
        downgradeRequested.value = true;
        await session.setPlan('free');
        if (session.billingMessage) return;
        // End-of-period cancel (FR-9): stay and show "Pro until <date>" instead of
        // an immediate switch. A direct/dev downgrade has no schedule → return.
        if (session.cancellationScheduled) return;
        returnToOrigin();
    }
</script>
