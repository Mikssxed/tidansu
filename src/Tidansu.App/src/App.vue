<script setup lang="ts">
    import AppLayout from '@/components/layout/AppLayout.vue';
    import PlainLayout from '@/components/layout/PlainLayout.vue';
    import PaywallModal from '@/components/paywall/PaywallModal.vue';
    import { usePlanCaps } from '@/composables/usePlanCaps';
    import { useAuthStore } from '@/stores/useAuthStore';
    import { useSpacesStore } from '@/stores/useSpacesStore';
    import { LayoutType } from '@/types';
    import { computed, onMounted } from 'vue';
    import { useRoute } from 'vue-router';

    const route = useRoute();
    const auth = useAuthStore();
    const spaces = useSpacesStore();
    const planCaps = usePlanCaps();

    // Switch the shell on the active route's layoutType meta. APP routes
    // (dashboard / pricing / account) get the in-app nav; everything else is bare.
    const layout = computed(() =>
        route.meta.layoutType === LayoutType.APP ? AppLayout : PlainLayout
    );

    // Load server-authoritative plan caps (anonymous — also needed by the public
    // pricing page). On reload, restore the user's spaces when already signed in.
    onMounted(() => {
        void planCaps.hydrate();
        if (auth.hasTokens) void spaces.hydrate();
    });
</script>

<template>
    <component :is="layout">
        <RouterView />
    </component>

    <!-- Single app-wide paywall; opened with a reason via useLimits() on any cap. -->
    <PaywallModal />
</template>
