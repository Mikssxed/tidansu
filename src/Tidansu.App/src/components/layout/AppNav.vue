<template>
    <header class="border-b border-border bg-bg/80 backdrop-blur">
        <nav
            class="mx-auto flex h-16 max-w-[1240px] items-center gap-4 px-[var(--gutter)]"
        >
            <RouterLink
                :to="{ name: 'spaces' }"
                class="flex items-center gap-2 font-extrabold tracking-tight text-text"
            >
                <span
                    class="flex size-7 items-center justify-center rounded-ctrl bg-pri-bg text-pri-fg"
                >
                    <BaseIcon
                        name="cabinet"
                        :size="16"
                    />
                </span>
                Tidansu
            </RouterLink>

            <div class="ml-4 hidden items-center gap-1 sm:flex">
                <RouterLink
                    v-for="link in navLinks"
                    :key="link.name"
                    :to="{ name: link.name }"
                    class="rounded-ctrl px-3 py-1.5 text-[14px] font-medium transition-colors hover:bg-surface-2 hover:text-text"
                    :class="link.class"
                >
                    {{ link.label }}
                </RouterLink>
            </div>

            <div class="ml-auto flex items-center gap-3">
                <template v-if="session.isAuthenticated">
                    <BaseBadge :variant="planBadgeVariant">
                        <BaseIcon
                            v-if="session.isPro"
                            name="sparkle"
                            :size="12"
                        />
                        {{ planLabel }}
                    </BaseBadge>
                    <RouterLink
                        :to="{ name: 'account' }"
                        class="flex size-9 items-center justify-center rounded-chip bg-surface-3 text-[14px] font-bold text-text transition-opacity hover:opacity-80"
                        :aria-label="avatarLabel"
                    >
                        {{ initial }}
                    </RouterLink>
                </template>
                <RouterLink
                    v-else
                    :to="{ name: 'login' }"
                    class="rounded-ctrl bg-pri-bg px-3.5 py-1.5 text-[14px] font-semibold text-pri-fg transition-opacity hover:opacity-90"
                >
                    Sign in
                </RouterLink>
            </div>
        </nav>
    </header>
</template>

<script setup lang="ts">
    import { BaseBadge, BaseIcon } from '@/components/base';
    import type { AppRouteName } from '@/router';
    import { useSessionStore } from '@/stores/useSessionStore';
    import { computed } from 'vue';
    import { useRoute } from 'vue-router';

    const session = useSessionStore();
    const route = useRoute();

    const LINKS: { name: AppRouteName; label: string }[] = [
        { name: 'spaces', label: 'Spaces' },
        { name: 'pricing', label: 'Pricing' },
    ];

    const navLinks = computed(() =>
        LINKS.map((link) => ({
            ...link,
            class: route.name === link.name ? 'bg-surface-2 text-text' : 'text-text-2',
        }))
    );

    const planBadgeVariant = computed(() => (session.isPro ? 'pro' : 'neutral'));
    const planLabel = computed(() => (session.isPro ? 'Pro' : 'Free'));
    const initial = computed(() => session.user?.name?.charAt(0).toUpperCase() ?? '?');
    const avatarLabel = computed(() => `Account — ${session.user?.name ?? ''}`);
</script>
