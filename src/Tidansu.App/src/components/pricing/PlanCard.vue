<template>
    <div
        class="flex flex-col rounded-card border p-[calc(20px*var(--pad))]"
        :class="cardClass"
    >
        <div class="flex items-center gap-2">
            <span class="text-[17px] font-bold text-text">{{ plan.name }}</span>
            <BaseBadge
                v-if="!isFree"
                variant="pro"
            >
                Pro
            </BaseBadge>
            <BaseBadge
                v-if="current"
                variant="neutral"
            >
                Current
            </BaseBadge>
        </div>
        <p class="mt-1 text-[13px] text-text-2">{{ plan.tagline }}</p>

        <div class="mt-4 flex items-baseline gap-1">
            <span class="text-[34px] font-bold leading-none text-text">${{ amount }}</span>
            <span class="text-[14px] text-text-3">/mo</span>
        </div>
        <div class="mt-1.5 flex items-center gap-2">
            <span class="text-[13px] text-text-3">{{ sub }}</span>
            <BaseBadge
                v-if="showSave"
                variant="pro"
            >
                save 20%
            </BaseBadge>
        </div>

        <ul class="mt-5 flex flex-1 flex-col gap-2.5">
            <li
                v-for="feature in features"
                :key="feature.key"
                class="flex items-center gap-2 text-[14px]"
                :class="feature.rowClass"
            >
                <BaseIcon
                    :name="feature.icon"
                    :size="15"
                    class="shrink-0"
                />
                <span class="flex-1">{{ feature.label }}</span>
                <span class="font-medium">{{ feature.value }}</span>
            </li>
        </ul>

        <BaseButton
            class="mt-6 w-full"
            :variant="cta.variant"
            :disabled="cta.disabled"
            @click="onChoose"
        >
            <BaseIcon
                v-if="cta.showIcon"
                name="sparkle"
                :size="17"
            />
            {{ cta.label }}
        </BaseButton>
    </div>
</template>

<script setup lang="ts">
    import { BaseBadge, BaseButton, BaseIcon } from '@/components/base';
    import type { ButtonVariant } from '@/components/base/BaseButton.vue';
    import { type PlanDef, PLAN_FEATURES } from '@/data/plans';
    import { computed } from 'vue';

    interface Props {
        plan: PlanDef;
        billing: 'month' | 'year';
        current: boolean;
    }

    const props = defineProps<Props>();
    const emit = defineEmits<{ choose: [] }>();

    const isFree = computed(() => props.plan.id === 'free');

    const amount = computed(() => {
        if (isFree.value) return '0';
        return props.billing === 'year' ? Math.round(props.plan.priceY / 12).toString() : `${props.plan.priceM}`;
    });

    const sub = computed(() => {
        if (isFree.value) return 'forever';
        return props.billing === 'year' ? `billed $${props.plan.priceY}/yr` : 'billed monthly';
    });

    const showSave = computed(() => !isFree.value && props.billing === 'year');

    const cardClass = computed(() => {
        const base = isFree.value ? 'border-border bg-surface' : 'border-pro/40 bg-pro/5';
        return props.current ? `${base} ring-1 ring-pro/40` : base;
    });

    const features = computed(() =>
        PLAN_FEATURES.map((f) => {
            const value = props.plan[f.key];
            const off = value === false;
            return {
                key: f.key,
                label: f.label,
                value: f.fmt(value),
                icon: off ? ('x' as const) : ('check' as const),
                rowClass: off ? 'text-text-3' : 'text-text',
            };
        })
    );

    const cta = computed<{ label: string; variant: ButtonVariant; disabled: boolean; showIcon: boolean }>(
        () => {
            if (props.current) return { label: 'Current plan', variant: 'secondary', disabled: true, showIcon: false };
            if (isFree.value) return { label: 'Switch to Free', variant: 'secondary', disabled: false, showIcon: false };
            return { label: 'Upgrade to Pro', variant: 'primary', disabled: false, showIcon: true };
        }
    );

    function onChoose() {
        emit('choose');
    }
</script>
