<template>
    <!-- Placeholder — full marketing landing built in Phase 10. -->
    <div class="mx-auto w-full max-w-[1000px] py-20">
        <p class="eyebrow">Spatial inventory</p>
        <h1 class="mt-3 max-w-2xl text-[clamp(34px,6vw,56px)] font-extrabold leading-[1.02]">
            Know what's on every shelf.
        </h1>
        <p class="mt-4 max-w-md text-[16px] text-text-2">
            Map your fridge, freezer, cellar and cabinets as real layouts and always know what's
            inside — including what's about to expire.
        </p>
        <div class="mt-7 flex flex-wrap gap-3">
            <RouterLink :to="{ name: 'login' }">
                <BaseButton>Get started — free</BaseButton>
            </RouterLink>
            <RouterLink :to="{ name: 'pricing' }">
                <BaseButton variant="secondary">See pricing</BaseButton>
            </RouterLink>
        </div>
        <p class="mt-3 text-[13px] text-text-3">Free for 2 spaces · no card needed</p>
    </div>
</template>

<script setup lang="ts">
    import { BaseButton } from '@/components/base';
</script>
