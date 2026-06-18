<template>
    <div class="flex min-h-screen flex-col">
        <AppNav />
        <main class="flex-1 px-[var(--gutter)] py-8">
            <slot />
        </main>
    </div>
</template>

<script setup lang="ts">
    import AppNav from '@/components/layout/AppNav.vue';
</script>
