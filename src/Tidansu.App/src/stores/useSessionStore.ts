import { useAccountApi } from '@/composables/useAccountApi';
import { type PlanDef, planOf } from '@/data/plans';
import type { Plan } from '@/data/types';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

export type { Plan };

export interface SessionUser {
    name: string;
    email: string;
    plan: Plan;
}

interface PersistedSession {
    user: SessionUser | null;
    syncOn: boolean;
}

const STORAGE_KEY = 'tidansu_session';

function load(): PersistedSession {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try {
            return JSON.parse(raw) as PersistedSession;
        } catch {
            localStorage.removeItem(STORAGE_KEY);
        }
    }
    return { user: null, syncOn: false };
}

/**
 * Holds the signed-in user's profile/plan/sync. Populated from the backend's
 * magic-link `AuthResponse` (see `useAuth`); the JWT itself lives in
 * `useAuthStore`. Plan/sync changes persist to `/api/account`. Spaces hydrate
 * separately in `useSpacesStore` after sign-in.
 */
export const useSessionStore = defineStore('session', () => {
    const account = useAccountApi();
    const persisted = load();
    const user = ref<SessionUser | null>(persisted.user);
    const syncOn = ref<boolean>(persisted.syncOn);

    watch(
        [user, syncOn],
        () =>
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ user: user.value, syncOn: syncOn.value } satisfies PersistedSession)
            ),
        { deep: true }
    );

    const isAuthenticated = computed(() => user.value !== null);
    const plan = computed<Plan>(() => user.value?.plan ?? 'free');
    const isPro = computed(() => plan.value === 'pro');
    /** Current plan's caps/features (spaces, zones, items, photos, sync, ...). */
    const caps = computed<PlanDef>(() => planOf(plan.value));

    /** Apply the authenticated user from the backend (spaces hydrate separately). */
    function setUser(next: SessionUser, sync: boolean): void {
        user.value = { name: next.name, email: next.email, plan: next.plan };
        syncOn.value = sync;
    }

    function signOut(): void {
        user.value = null;
        syncOn.value = false;
    }

    /**
     * Optimistically set the plan and persist it. When billing returns a checkout
     * URL (Stripe upgrade), revert the optimistic flip and redirect — the webhook
     * applies Pro after payment. In direct/dev mode there is no URL and the flip stands.
     */
    function setPlan(next: Plan): void {
        if (!user.value) return;
        const previous = user.value.plan;
        user.value.plan = next;
        account
            .changePlan(next)
            .then((res) => {
                const checkoutUrl = res?.data?.checkoutUrl;
                if (checkoutUrl) {
                    if (user.value) user.value.plan = previous;
                    window.location.href = checkoutUrl;
                }
            })
            .catch((e) => console.error('[session] plan change failed', e));
    }

    /** Optimistically set sync and persist it (the caller pre-checks the Pro gate). */
    function setSync(on: boolean): void {
        syncOn.value = on;
        void account.setSync(on).catch((e) => console.error('[session] sync change failed', e));
    }

    return {
        user,
        syncOn,
        isAuthenticated,
        plan,
        isPro,
        caps,
        setUser,
        signOut,
        setPlan,
        setSync,
    };
});
