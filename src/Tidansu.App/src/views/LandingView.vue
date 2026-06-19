<template>
    <div class="mx-auto w-full max-w-[1040px]">
        <!-- Nav -->
        <header class="flex h-16 items-center gap-4">
            <span class="flex items-center gap-2 font-extrabold tracking-tight text-text">
                <span class="flex size-7 items-center justify-center rounded-ctrl bg-pri-bg text-pri-fg">
                    <BaseIcon
                        name="cabinet"
                        :size="16"
                    />
                </span>
                Tidansu
            </span>
            <nav class="ml-auto hidden items-center gap-1 sm:flex">
                <RouterLink
                    :to="{ name: 'pricing' }"
                    class="rounded-ctrl px-3 py-1.5 text-[14px] font-medium text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
                >
                    Pricing
                </RouterLink>
                <RouterLink
                    :to="{ name: 'login' }"
                    class="rounded-ctrl px-3 py-1.5 text-[14px] font-medium text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
                >
                    Sign in
                </RouterLink>
            </nav>
            <RouterLink
                :to="{ name: 'login' }"
                class="rounded-ctrl bg-pri-bg px-3.5 py-1.5 text-[14px] font-semibold text-pri-fg transition-opacity hover:opacity-90 max-sm:ml-auto"
            >
                Get started
            </RouterLink>
        </header>

        <!-- Hero -->
        <section class="grid items-center gap-10 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
            <div>
                <p class="eyebrow">Spatial inventory</p>
                <h1 class="mt-3 text-[clamp(34px,6vw,52px)] font-extrabold leading-[1.03]">
                    Know what's on every shelf.
                </h1>
                <p class="mt-4 max-w-[48ch] text-[16px] leading-relaxed text-text-2">
                    Tidansu maps your fridge, freezer, cabinets and cellar — so you always know what you
                    have, where it sits, and what's about to expire. No spreadsheets. No guessing.
                </p>
                <div class="mt-7 flex flex-wrap gap-3">
                    <RouterLink :to="{ name: 'login' }">
                        <BaseButton>
                            Get started — free
                            <BaseIcon
                                name="arrowR"
                                :size="18"
                            />
                        </BaseButton>
                    </RouterLink>
                    <RouterLink :to="{ name: 'pricing' }">
                        <BaseButton variant="secondary">See pricing</BaseButton>
                    </RouterLink>
                </div>
                <p class="mt-4 flex items-center gap-1.5 text-[13px] text-text-3">
                    <BaseIcon
                        name="check"
                        :size="14"
                    />
                    Free for 2 spaces · no card needed
                </p>
            </div>

            <!-- Faux space-card illustration -->
            <div
                class="rounded-card border border-border bg-surface p-[calc(18px*var(--pad))]"
                aria-hidden="true"
            >
                <div class="flex items-center gap-2">
                    <span class="size-2.5 rounded-[3px] bg-zone-blue" />
                    <span class="text-[14px] font-semibold text-text">My fridge</span>
                    <span class="ml-auto text-[12px] text-text-3">23 items · 4 shelves</span>
                </div>
                <div class="mt-3 flex flex-col gap-2.5">
                    <div
                        v-for="shelf in heroShelves"
                        :key="shelf.name"
                        class="flex items-center gap-3 rounded-ctrl border border-border-faint bg-surface-2 p-2.5"
                    >
                        <span
                            class="h-8 w-1 shrink-0 rounded-chip"
                            :class="shelf.accentClass"
                        />
                        <div class="min-w-0">
                            <div class="text-[12px] font-medium text-text-3">{{ shelf.name }}</div>
                            <div class="mt-1 flex flex-wrap gap-1.5">
                                <span
                                    v-for="chip in shelf.items"
                                    :key="chip.label"
                                    class="inline-flex items-center gap-1 rounded-chip border border-border bg-surface px-2 py-0.5 text-[11px] text-text-2"
                                >
                                    <BaseIcon
                                        :name="chip.icon"
                                        :size="12"
                                    />
                                    {{ chip.label }}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- How it works -->
        <section class="rounded-card border border-border bg-surface p-[calc(22px*var(--pad))]">
            <div class="grid gap-8 sm:grid-cols-3">
                <div
                    v-for="step in steps"
                    :key="step.title"
                >
                    <span class="flex size-9 items-center justify-center rounded-ctrl bg-surface-2 text-text">
                        <BaseIcon
                            :name="step.icon"
                            :size="19"
                        />
                    </span>
                    <div class="mt-3 text-[13px] font-semibold tabular-nums text-text-3">{{ step.number }}</div>
                    <div class="mt-1 text-[16px] font-bold text-text">{{ step.title }}</div>
                    <p class="mt-1.5 text-[14px] leading-relaxed text-text-2">{{ step.desc }}</p>
                </div>
            </div>
        </section>

        <!-- Features -->
        <section class="mt-6 grid gap-4 sm:grid-cols-3">
            <div
                v-for="feature in features"
                :key="feature.title"
                class="rounded-card border border-border bg-surface p-[calc(18px*var(--pad))]"
            >
                <span class="flex size-10 items-center justify-center rounded-ctrl bg-surface-2 text-text">
                    <BaseIcon
                        :name="feature.icon"
                        :size="20"
                    />
                </span>
                <div class="mt-3 text-[16px] font-bold text-text">{{ feature.title }}</div>
                <p class="mt-1.5 text-[14px] leading-relaxed text-text-2">{{ feature.desc }}</p>
            </div>
        </section>

        <!-- Pricing teaser -->
        <section class="mt-6 grid items-center gap-8 rounded-card border border-border bg-surface p-[calc(22px*var(--pad))] lg:grid-cols-2">
            <div>
                <h2 class="text-[22px] font-bold leading-tight">
                    Start free. Upgrade when your kitchen grows.
                </h2>
                <p class="mt-3 max-w-[48ch] text-[14px] leading-relaxed text-text-2">
                    Two spaces and fifty items are plenty to begin. When you're mapping the whole house,
                    Pro lifts every limit and adds photos & sync.
                </p>
                <RouterLink :to="{ name: 'pricing' }">
                    <BaseButton
                        variant="secondary"
                        class="mt-4"
                    >
                        Compare plans
                        <BaseIcon
                            name="arrowR"
                            :size="16"
                        />
                    </BaseButton>
                </RouterLink>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div class="rounded-card border border-border bg-surface-2 p-4">
                    <div class="text-[14px] font-semibold text-text">Free</div>
                    <div class="mt-2 text-[26px] font-bold text-text">$0</div>
                    <div class="mt-1 text-[12px] text-text-3">2 spaces · 50 items each</div>
                </div>
                <div class="rounded-card border border-pro/40 bg-pro/5 p-4">
                    <div class="flex items-center gap-1.5">
                        <span class="text-[14px] font-semibold text-text">Pro</span>
                        <BaseBadge variant="pro">Pro</BaseBadge>
                    </div>
                    <div class="mt-2 flex items-baseline gap-0.5">
                        <span class="text-[26px] font-bold text-text">$5</span>
                        <span class="text-[13px] text-text-3">/mo</span>
                    </div>
                    <div class="mt-1 text-[12px] text-text-3">Unlimited · photos · sync</div>
                </div>
            </div>
        </section>

        <!-- Final CTA -->
        <section class="py-16 text-center">
            <h2 class="text-[26px] font-bold">Put everything in its place.</h2>
            <RouterLink
                :to="{ name: 'login' }"
                class="mt-5 inline-block"
            >
                <BaseButton>
                    Get started — free
                    <BaseIcon
                        name="arrowR"
                        :size="18"
                    />
                </BaseButton>
            </RouterLink>
        </section>

        <!-- Footer -->
        <footer class="flex flex-wrap items-center gap-4 border-t border-border py-6">
            <span class="flex items-center gap-2 font-bold text-text">
                <span class="flex size-5 items-center justify-center rounded-[6px] bg-pri-bg text-pri-fg">
                    <BaseIcon
                        name="cabinet"
                        :size="12"
                    />
                </span>
                Tidansu
            </span>
            <span class="ml-auto flex items-center gap-4 text-[13px]">
                <RouterLink
                    :to="{ name: 'pricing' }"
                    class="text-text-2 transition-colors hover:text-text"
                >
                    Pricing
                </RouterLink>
                <RouterLink
                    :to="{ name: 'login' }"
                    class="text-text-2 transition-colors hover:text-text"
                >
                    Sign in
                </RouterLink>
                <span class="text-text-3">© 2026 Tidansu</span>
            </span>
        </footer>
    </div>
</template>

<script setup lang="ts">
    import { BaseBadge, BaseButton, BaseIcon } from '@/components/base';
    import { zoneBgClasses } from '@/composables/useColorVariant';
    import type { IconName } from '@/components/icons';

    interface HeroChip {
        icon: IconName;
        label: string;
    }
    interface HeroShelf {
        name: string;
        accentClass: string;
        items: HeroChip[];
    }

    const heroShelves: HeroShelf[] = [
        {
            name: 'Top shelf',
            accentClass: zoneBgClasses.blue,
            items: [
                { icon: 'milk', label: 'Milk' },
                { icon: 'bowl', label: 'Leftovers' },
                { icon: 'bottle', label: 'Juice' },
            ],
        },
        {
            name: 'Middle',
            accentClass: zoneBgClasses.green,
            items: [
                { icon: 'egg', label: 'Eggs ×12' },
                { icon: 'cheese', label: 'Cheddar' },
                { icon: 'jar', label: 'Pickles' },
            ],
        },
        {
            name: 'Door',
            accentClass: zoneBgClasses.amber,
            items: [
                { icon: 'cheese', label: 'Butter' },
                { icon: 'jar', label: 'Ketchup' },
            ],
        },
    ];

    const steps: { number: string; icon: IconName; title: string; desc: string }[] = [
        {
            number: '01',
            icon: 'plus',
            title: 'Add it fast',
            desc: 'Type “milk, top shelf ×2” — or scan a barcode. It lands in the right place.',
        },
        {
            number: '02',
            icon: 'grid',
            title: 'Lay it out',
            desc: 'Draw your shelves, drawers and cabinets once. See exactly where things sit.',
        },
        {
            number: '03',
            icon: 'search',
            title: 'Always know',
            desc: 'Search, group by shelf, and catch what’s about to expire before it’s gone.',
        },
    ];

    const features: { icon: IconName; title: string; desc: string }[] = [
        {
            icon: 'cabinet',
            title: 'Spaces for everything',
            desc: 'Fridge, freezer, cellar, cabinets — each mapped its own way.',
        },
        {
            icon: 'layers',
            title: 'A real layout',
            desc: 'Levels, depth and walls. Open the door and look in, top-down or shelf by shelf.',
        },
        {
            icon: 'sparkle',
            title: 'Expiry that warns you',
            desc: 'Soft nudges as dates approach. Nothing forgotten at the back.',
        },
    ];
</script>
