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

        <!-- Plan cards -->
        <div class="mt-8 grid gap-4 sm:grid-cols-2">
            <PlanCard
                :plan="freePlan"
                :billing="billing"
                :current="currentPlan === 'free'"
                @choose="onDowngrade"
            />
            <PlanCard
                :plan="proPlan"
                :billing="billing"
                :current="currentPlan === 'pro'"
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
    </div>
</template>

<script setup lang="ts">
    import { BaseIcon } from '@/components/base';
    import PlanCard from '@/components/pricing/PlanCard.vue';
    import { PLAN_FEATURES, planOf } from '@/data/plans';
    import type { Plan } from '@/data/types';
    import { useSessionStore } from '@/stores/useSessionStore';
    import { computed, ref } from 'vue';
    import { useRouter } from 'vue-router';

    const session = useSessionStore();
    const router = useRouter();

    const billing = ref<'month' | 'year'>('year');

    const freePlan = computed(() => planOf('free'));
    const proPlan = computed(() => planOf('pro'));
    const currentPlan = computed<Plan>(() => session.plan);

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
        session.setPlan('pro');
        returnToOrigin();
    }

    function onDowngrade() {
        if (!session.isAuthenticated) {
            router.push({ name: 'login', query: { returnUrl: '/pricing' } });
            return;
        }
        session.setPlan('free');
        returnToOrigin();
    }
</script>
