<template>
    <div
        v-if="user"
        class="mx-auto w-full max-w-[640px]"
    >
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
                Back to spaces
            </button>
        </div>

        <!-- Billing unavailable (e.g. Stripe misconfigured / 503) -->
        <div
            v-if="session.billingMessage"
            class="mt-4 flex items-start gap-2.5 rounded-card border border-warn/40 bg-warn/10 px-4 py-3"
            role="alert"
        >
            <BaseIcon
                name="lock"
                :size="16"
                class="mt-0.5 shrink-0 text-warn"
            />
            <p class="flex-1 text-[14px] text-text">{{ session.billingMessage }}</p>
            <button
                type="button"
                class="shrink-0 text-text-3 transition-colors hover:text-text"
                aria-label="Dismiss message"
                @click="onDismissBilling"
            >
                <BaseIcon
                    name="x"
                    :size="15"
                />
            </button>
        </div>

        <!-- Profile -->
        <div class="mt-6 flex items-center gap-4 rounded-card border border-border bg-surface p-[calc(18px*var(--pad))]">
            <span class="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[18px] font-bold text-text">
                {{ initials }}
            </span>
            <div class="min-w-0">
                <div class="truncate text-[17px] font-bold text-text">{{ user.name }}</div>
                <div class="truncate text-[14px] text-text-2">{{ user.email }}</div>
            </div>
            <BaseBadge
                class="ml-auto"
                :variant="planBadgeVariant"
            >
                <BaseIcon
                    v-if="isPro"
                    name="sparkle"
                    :size="13"
                />
                {{ caps.name }}
            </BaseBadge>
        </div>

        <!-- Plan -->
        <div class="mt-4 rounded-card border border-border bg-surface p-[calc(18px*var(--pad))]">
            <div class="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">
                <BaseIcon
                    name="sparkle"
                    :size="15"
                />
                Plan
            </div>
            <p class="mt-3 text-[14px] text-text-2">{{ planLead }}</p>
            <p
                v-if="cancelNotice"
                class="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-warn"
            >
                <BaseIcon
                    name="restart"
                    :size="14"
                />
                {{ cancelNotice }}
            </p>
            <div class="mt-4 flex flex-wrap gap-2.5">
                <template v-if="isPro">
                    <BaseButton
                        variant="secondary"
                        size="sm"
                        @click="goPricing"
                    >
                        Manage billing
                    </BaseButton>
                    <BaseButton
                        variant="secondary"
                        size="sm"
                        @click="onDowngrade"
                    >
                        Switch to Free
                    </BaseButton>
                </template>
                <BaseButton
                    v-else
                    size="sm"
                    @click="goPricing"
                >
                    <BaseIcon
                        name="sparkle"
                        :size="16"
                    />
                    Upgrade to Pro
                </BaseButton>
            </div>
        </div>

        <!-- Usage -->
        <div class="mt-4 rounded-card border border-border bg-surface p-[calc(18px*var(--pad))]">
            <div class="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">
                <BaseIcon
                    name="grid"
                    :size="15"
                />
                Usage
            </div>
            <div class="mt-4 flex flex-col gap-4">
                <UsageMeter
                    label="Spaces"
                    :used="spaceCount"
                    :cap="caps.spaces"
                />
                <UsageMeter
                    label="Items (all spaces)"
                    :used="totalItems"
                    :cap="itemsCap"
                />
                <UsageMeter
                    label="Fullest space"
                    :used="fullestSpace"
                    :cap="caps.items"
                />
                <p
                    v-if="!isPro"
                    class="flex items-center gap-1.5 text-[12px] text-text-3"
                >
                    <BaseIcon
                        name="lock"
                        :size="13"
                    />
                    Limits apply per space. Upgrade to remove them all.
                </p>
            </div>
        </div>

        <!-- Sync -->
        <div class="mt-4 rounded-card border border-border bg-surface p-[calc(18px*var(--pad))]">
            <div class="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">
                <BaseIcon
                    name="restart"
                    :size="15"
                />
                Sync
                <BaseBadge
                    v-if="!isPro"
                    class="ml-auto"
                    variant="pro"
                >
                    <BaseIcon
                        name="lock"
                        :size="11"
                    />
                    Pro
                </BaseBadge>
            </div>
            <button
                type="button"
                class="mt-3 flex w-full items-center gap-3 rounded-ctrl border bg-surface-2 p-3 text-left transition-colors"
                :class="syncRowClass"
                @click="onToggleSync"
            >
                <span
                    class="flex size-5 shrink-0 items-center justify-center rounded-[6px] border border-border-strong"
                    :class="syncBoxClass"
                >
                    <BaseIcon
                        v-if="syncChecked"
                        name="check"
                        :size="13"
                    />
                </span>
                <span class="min-w-0">
                    <span class="block text-[14px] font-medium text-text">Sync across devices</span>
                    <span class="block text-[13px] text-text-3">{{ syncDesc }}</span>
                </span>
                <BaseIcon
                    v-if="!isPro"
                    name="lock"
                    :size="15"
                    class="ml-auto shrink-0 text-text-3"
                />
            </button>
        </div>

        <BaseButton
            variant="secondary"
            class="mt-6 w-full"
            @click="onSignOut"
        >
            <BaseIcon
                name="arrowL"
                :size="16"
            />
            Sign out
        </BaseButton>
    </div>
</template>

<script setup lang="ts">
    import { BaseBadge, BaseButton, BaseIcon } from '@/components/base';
    import UsageMeter from '@/components/spaces/UsageMeter.vue';
    import { useAuth } from '@/composables/useAuth';
    import { useLimits } from '@/composables/useLimits';
    import { isInf } from '@/data/plans';
    import { useSessionStore } from '@/stores/useSessionStore';
    import { useSpacesStore } from '@/stores/useSpacesStore';
    import { computed } from 'vue';
    import { useRouter } from 'vue-router';

    const session = useSessionStore();
    const store = useSpacesStore();
    const limits = useLimits();
    const auth = useAuth();
    const router = useRouter();

    const user = computed(() => session.user);
    const isPro = computed(() => session.isPro);
    const caps = computed(() => session.caps);
    const planBadgeVariant = computed(() => (isPro.value ? 'pro' : 'neutral'));

    const initials = computed(() => {
        const source = user.value?.name || user.value?.email || '?';
        return source.trim().slice(0, 1).toUpperCase();
    });

    const planLead = computed(() =>
        isPro.value
            ? 'You’re on Pro — unlimited spaces, item photos and sync across devices.'
            : `You’re on Free — ${caps.value.spaces} spaces, ${caps.value.items} items each, this device only.`
    );

    const cancelNotice = computed(() => {
        if (!session.cancellationScheduled || !session.proAccessUntilLabel) return '';
        return `Pro until ${session.proAccessUntilLabel}, cancels then.`;
    });

    const spaceCount = computed(() => store.count);
    // Post-B-16 spaces are lazy-loaded, so `s.items` is empty until a space is
    // opened — read the summary's `itemCount` (kept in sync via refreshSummary)
    // so usage meters stay accurate for every loaded space (FR-2).
    const totalItems = computed(() => store.spaces.reduce((n, s) => n + s.itemCount, 0));
    const fullestSpace = computed(() =>
        store.spaces.reduce((max, s) => Math.max(max, s.itemCount), 0)
    );
    const itemsCap = computed(() =>
        isInf(caps.value.items) ? Infinity : caps.value.items * Math.max(1, store.count)
    );

    const syncChecked = computed(() => isPro.value && session.syncOn);
    const syncDesc = computed(() => {
        if (!isPro.value) return 'Free plan keeps everything on this device only.';
        return session.syncOn
            ? 'Your spaces stay in step everywhere.'
            : 'Turn on to sync phone, tablet and laptop.';
    });
    const syncRowClass = computed(() =>
        syncChecked.value ? 'border-pro/40' : 'border-border hover:border-border-strong'
    );
    const syncBoxClass = computed(() => (syncChecked.value ? 'bg-pro/20 text-pro' : ''));

    function goBack() {
        router.push({ name: 'spaces' });
    }
    function goPricing() {
        router.push({ name: 'pricing' });
    }
    function onDowngrade() {
        // End-of-period cancel (FR-9): the store keeps Pro and records
        // `proAccessUntil`; `cancelNotice` then shows "Pro until <date>, cancels then".
        void session.setPlan('free');
    }
    function onDismissBilling() {
        session.dismissBillingMessage();
    }
    function onToggleSync() {
        if (!limits.guard(limits.checkSync())) return;
        session.setSync(!session.syncOn);
    }
    function onSignOut() {
        auth.signOut();
        router.push({ name: 'login' });
    }
</script>
