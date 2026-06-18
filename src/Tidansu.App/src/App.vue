<script setup lang="ts">
    import AppLayout from '@/components/layout/AppLayout.vue';
    import PlainLayout from '@/components/layout/PlainLayout.vue';
    import { LayoutType } from '@/types';
    import { computed } from 'vue';
    import { useRoute } from 'vue-router';

    const route = useRoute();

    // Switch the shell on the active route's layoutType meta. APP routes
    // (dashboard / pricing / account) get the in-app nav; everything else is bare.
    const layout = computed(() =>
        route.meta.layoutType === LayoutType.APP ? AppLayout : PlainLayout
    );
</script>

<template>
    <component :is="layout">
        <RouterView />
    </component>
</template>
