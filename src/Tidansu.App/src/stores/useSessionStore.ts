import { type PlanDef, planOf } from '@/data/plans';
import type { Plan } from '@/data/types';
import { useSpacesStore } from '@/stores/useSpacesStore';
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

/** "alex.smith@x.com" -> "Alex Smith" (name derived from the email local-part). */
function nameFromEmail(email: string): string {
    const local = email.split('@')[0] ?? '';
    const words = local
        .split(/[._\-+]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
    return words.join(' ') || 'There';
}

/**
 * Mock session for the frontend-first build. Magic-link sign-in derives the user
 * from the email, defaults to the Free plan, and seeds a starter space on first
 * login. Phases 11–12 replace this with the real JWT-backed magic-link flow.
 */
export const useSessionStore = defineStore('session', () => {
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

    /** Sign in (or create) via the magic link; seeds a starter space on first login. */
    function signIn(email: string): void {
        user.value = { name: nameFromEmail(email), email, plan: 'free' };
        useSpacesStore().seedStarterIfEmpty();
    }

    function signOut(): void {
        user.value = null;
    }

    function setPlan(next: Plan): void {
        if (user.value) user.value.plan = next;
    }

    function setSync(on: boolean): void {
        syncOn.value = on;
    }

    return {
        user,
        syncOn,
        isAuthenticated,
        plan,
        isPro,
        caps,
        signIn,
        signOut,
        setPlan,
        setSync,
    };
});
