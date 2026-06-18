import { useSessionStore } from '@/stores/useSessionStore';
import { LayoutType } from '@/types';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

declare module 'vue-router' {
    interface RouteMeta {
        requiresAuth: boolean;
        layoutType: LayoutType;
    }
}

export type AppRouteName = keyof typeof AppViews;

export const AppViews = {
    landing: () => import('@/views/LandingView.vue'),
    login: () => import('@/views/auth/LoginView.vue'),
    spaces: () => import('@/views/DashboardView.vue'),
    spacesNew: () => import('@/views/CreateSpaceView.vue'),
    space: () => import('@/views/SpaceView.vue'),
    pricing: () => import('@/views/PricingView.vue'),
    account: () => import('@/views/AccountView.vue'),
};

const createRoute = (
    path: string,
    name: AppRouteName,
    layoutType: LayoutType,
    requiresAuth = true,
    props = false
): RouteRecordRaw => ({
    path,
    name,
    component: AppViews[name],
    props,
    meta: { requiresAuth, layoutType },
});

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        createRoute('/', 'landing', LayoutType.PLAIN, false),
        createRoute('/login', 'login', LayoutType.PLAIN, false),
        createRoute('/spaces', 'spaces', LayoutType.APP, true),
        createRoute('/spaces/new', 'spacesNew', LayoutType.PLAIN, true),
        createRoute('/spaces/:id', 'space', LayoutType.PLAIN, true, true),
        createRoute('/pricing', 'pricing', LayoutType.APP, false),
        createRoute('/account', 'account', LayoutType.APP, true),
    ],
});

router.beforeEach((to) => {
    const session = useSessionStore();
    const requiresAuth =
        import.meta.env.VITE_DISABLE_AUTH !== 'true' && to.meta.requiresAuth !== false;
    // Pages an authenticated user should be bounced away from, straight to their spaces.
    const guestOnly = ['login', 'landing'].includes(to.name as string);

    if (requiresAuth && !session.isAuthenticated) {
        return { name: 'login', query: { returnUrl: to.fullPath } };
    }
    if (guestOnly && session.isAuthenticated) {
        return { name: 'spaces' };
    }
    return true;
});

const TITLES: Partial<Record<AppRouteName, string>> = {
    login: 'Sign in',
    spaces: 'Your spaces',
    spacesNew: 'New space',
    space: 'Space',
    pricing: 'Pricing',
    account: 'Account',
};

const BASE_TITLE = "Tidansu — Know what's on every shelf";

router.afterEach((to) => {
    const title = TITLES[to.name as AppRouteName];
    document.title = title ? `${title} · Tidansu` : BASE_TITLE;
});

export default router;
