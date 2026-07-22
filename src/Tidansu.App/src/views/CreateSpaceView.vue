<template>
    <div class="mx-auto w-full max-w-[560px] py-10">
        <OnboardingStepBar :step="step" />

        <!-- Step 1 — type -->
        <div v-if="step === 1">
            <button
                type="button"
                class="mt-6 inline-flex items-center gap-1.5 text-[14px] text-text-2 transition-colors hover:text-text"
                @click="backToSpaces"
            >
                <BaseIcon
                    name="arrowL"
                    :size="15"
                />
                Back to spaces
            </button>
            <h1 class="mt-4 text-[26px] font-bold">What do you want to organize?</h1>
            <p class="mt-2 text-[14px] text-text-2">
                Pick a space. We'll set up sensible shelves for you automatically — you can rename or
                rearrange them anytime.
            </p>
            <div class="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                    v-for="s in SPACE_TYPES"
                    :key="s.id"
                    type="button"
                    class="flex flex-col items-start rounded-card border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
                    @click="chooseType(s.id)"
                >
                    <span class="flex size-9 items-center justify-center rounded-ctrl border border-border bg-surface-2 text-text-2">
                        <BaseIcon
                            :name="s.icon"
                            :size="20"
                        />
                    </span>
                    <span class="mt-3 text-[15px] font-bold text-text">{{ s.title }}</span>
                    <span class="mt-0.5 text-[13px] text-text-3">{{ s.desc }}</span>
                </button>
            </div>
        </div>

        <!-- Step 2 — complexity -->
        <div v-else-if="step === 2">
            <h1 class="mt-6 text-[26px] font-bold">How complex is the layout?</h1>
            <p class="mt-2 text-[14px] text-text-2">
                Most spaces are simple. You can always switch to a richer layout later — nothing you
                add now is lost.
            </p>
            <div class="mt-6 flex flex-col gap-3">
                <button
                    v-for="o in complexityOptions"
                    :key="o.id"
                    type="button"
                    class="flex items-center gap-3 rounded-card border bg-surface p-4 text-left transition-colors"
                    :class="o.rowClass"
                    @click="selectComplexity(o.id)"
                >
                    <span
                        class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-chip border-2"
                        :class="o.radioClass"
                    >
                        <span
                            v-if="o.selected"
                            class="size-2.5 rounded-chip bg-text"
                        />
                    </span>
                    <span class="min-w-0 flex-1">
                        <span class="flex items-center gap-2 text-[15px] font-bold text-text">
                            {{ o.title }}
                            <BaseBadge
                                v-if="o.advanced"
                                variant="pro"
                            >
                                Advanced
                            </BaseBadge>
                        </span>
                        <span class="mt-0.5 block text-[13px] text-text-3">{{ o.desc }}</span>
                    </span>
                    <ComplexityViz :viz="o.viz" />
                </button>
            </div>
            <div class="mt-6 flex gap-3">
                <BaseButton
                    variant="secondary"
                    @click="goToStep(1)"
                >
                    <BaseIcon
                        name="arrowL"
                        :size="18"
                    />
                </BaseButton>
                <BaseButton
                    class="flex-1"
                    @click="goToStep(3)"
                >
                    Continue
                    <BaseIcon
                        name="arrowR"
                        :size="18"
                    />
                </BaseButton>
            </div>
        </div>

        <!-- Step 3 — confirm -->
        <div v-else>
            <h1 class="mt-6 text-[26px] font-bold">Here's your {{ spaceWord }}</h1>
            <p class="mt-2 text-[14px] text-text-2">
                We numbered the shelves from the top. Names are optional — "{{ noun }} 1",
                "{{ noun }} 2"… stay consistent even if you rename some.
            </p>

            <label
                for="space-name"
                class="mt-6 block text-[12px] font-bold uppercase tracking-[0.08em] text-text-3"
            >
                Name
            </label>
            <input
                id="space-name"
                v-model="name"
                type="text"
                :placeholder="defaultName"
                class="mt-2 h-11 w-full rounded-ctrl border border-border bg-surface-2 px-3.5 text-[15px] text-text placeholder:text-text-3 focus:border-border-strong focus:outline-none"
            />

            <template v-if="showZonePreview">
                <p class="mt-6 text-[12px] font-bold uppercase tracking-[0.08em] text-text-3">
                    {{ previewRows.length }} zones, ready to fill
                </p>
                <div class="mt-2.5 flex flex-col gap-1.5">
                    <div
                        v-for="row in previewRows"
                        :key="row.id"
                        class="flex items-center gap-2.5 rounded-ctrl border border-border bg-surface px-3 py-2"
                    >
                        <span
                            class="size-3 shrink-0 rounded-[4px]"
                            :class="row.colorClass"
                        />
                        <span class="text-[14px] font-medium text-text">{{ row.name }}</span>
                        <span class="ml-auto text-[12px] text-text-3">{{ row.meta }}</span>
                    </div>
                </div>
            </template>

            <div class="mt-6 flex gap-3">
                <BaseButton
                    variant="secondary"
                    @click="goToStep(2)"
                >
                    <BaseIcon
                        name="arrowL"
                        :size="18"
                    />
                </BaseButton>
                <BaseButton
                    class="flex-1"
                    @click="finish"
                >
                    Start adding items
                    <BaseIcon
                        name="arrowR"
                        :size="18"
                    />
                </BaseButton>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { BaseBadge, BaseButton, BaseIcon } from '@/components/base';
    import ComplexityViz from '@/components/onboarding/ComplexityViz.vue';
    import OnboardingStepBar from '@/components/onboarding/OnboardingStepBar.vue';
    import { zoneBgClasses } from '@/composables/useColorVariant';
    import { useLimits } from '@/composables/useLimits';
    import { COMPLEXITY, DEFAULT_NAME, seedForType } from '@/data/onboarding';
    import { buildZones, SPACE_TYPES, spaceTypeDef, zoneName, type Complexity } from '@/data/spaces';
    import type { SpaceTypeId, Zone } from '@/data/types';
    import { useSpacesStore } from '@/stores/useSpacesStore';
    import { computed, ref } from 'vue';
    import { useRouter } from 'vue-router';

    const store = useSpacesStore();
    const router = useRouter();
    const limits = useLimits();

    const step = ref(1);
    const type = ref<SpaceTypeId | null>(null);
    const complexity = ref<Complexity>('simple');
    const name = ref('');

    const defaultName = computed(() => (type.value ? DEFAULT_NAME[type.value] : 'My space'));
    const noun = computed(() => (type.value ? spaceTypeDef(type.value).noun : 'Shelf'));
    const spaceWord = computed(() => (type.value === 'list' ? 'list' : 'space'));
    const showZonePreview = computed(() => type.value !== null && type.value !== 'list');

    const complexityOptions = computed(() =>
        COMPLEXITY.map((o) => {
            const selected = complexity.value === o.id;
            return {
                ...o,
                selected,
                rowClass: selected
                    ? 'border-text-3 bg-surface-2'
                    : 'border-border hover:border-border-strong',
                radioClass: selected ? 'border-text' : 'border-border-strong',
            };
        })
    );

    const previewRows = computed(() => {
        if (!type.value) return [];
        return buildZones(type.value).map((z) => ({
            id: z.id,
            name: zoneName(z, type.value!),
            meta: zoneMeta(z),
            colorClass: zoneBgClasses[z.color],
        }));
    });

    function zoneMeta(z: Zone): string {
        const base = z.floor ? 'plain list' : z.hasDepth ? 'front / back' : `${z.gridCols} slots`;
        return z.label ? `${base} · custom name` : base;
    }

    function chooseType(id: SpaceTypeId) {
        type.value = id;
        name.value = DEFAULT_NAME[id];
        step.value = 2;
    }

    function selectComplexity(id: Complexity) {
        complexity.value = id;
    }

    function goToStep(n: number) {
        step.value = n;
    }

    function backToSpaces() {
        router.push({ name: 'spaces' });
    }

    function finish() {
        if (!type.value) return;
        // Mirror DashboardView.goCreate: block completing onboarding once the space
        // cap is reached (e.g. reaching /spaces/new directly at the cap) so we open
        // the paywall instead of an optimistic create-then-vanish. Server enforces too.
        if (!limits.guard(limits.checkAddSpace())) return;
        const space = seedForType(type.value, name.value.trim() || defaultName.value, complexity.value);
        store.addSpace(space);
        // B-23 FR-6 regression fix: navigate via the store's `goToSpace` (not a bare
        // `router.push`) so `reconcileSpaceId` can reliably re-route once the server
        // assigns the real id — see `goToSpace`'s doc.
        store.goToSpace(space.id);
    }
</script>
