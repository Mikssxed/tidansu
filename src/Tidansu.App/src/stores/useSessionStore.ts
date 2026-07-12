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
    /** End-of-period cancel scheduled (FR-9): Pro is kept until `proAccessUntil`. */
    cancellationScheduled?: boolean;
    /** ISO date until which Pro access is retained after a scheduled cancel. */
    proAccessUntil?: string | null;
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
    return { user: null, syncOn: false, cancellationScheduled: false, proAccessUntil: null };
}

const BILLING_UNAVAILABLE_MESSAGE =
    'Billing is currently unavailable. Your plan is unchanged — please try again later.';

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
    /** True once an end-of-period cancel is scheduled (Pro kept until `proAccessUntil`). */
    const cancellationScheduled = ref<boolean>(persisted.cancellationScheduled ?? false);
    /** ISO date string Pro access runs until after a scheduled cancel, else null. */
    const proAccessUntil = ref<string | null>(persisted.proAccessUntil ?? null);
    /** Transient, user-visible message when a plan change fails (e.g. billing off). */
    const billingMessage = ref<string | null>(null);

    watch(
        [user, syncOn, cancellationScheduled, proAccessUntil],
        () =>
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                    user: user.value,
                    syncOn: syncOn.value,
                    cancellationScheduled: cancellationScheduled.value,
                    proAccessUntil: proAccessUntil.value,
                } satisfies PersistedSession)
            ),
        { deep: true }
    );

    const isAuthenticated = computed(() => user.value !== null);
    const plan = computed<Plan>(() => user.value?.plan ?? 'free');
    const isPro = computed(() => plan.value === 'pro');
    /** Current plan's caps/features (spaces, zones, items, photos, sync, ...). */
    const caps = computed<PlanDef>(() => planOf(plan.value));

    /** Human-readable date Pro access runs until, or '' when no cancel is scheduled. */
    const proAccessUntilLabel = computed<string>(() => {
        if (!proAccessUntil.value) return '';
        return new Date(proAccessUntil.value).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    });

    /** Apply the authenticated user from the backend (spaces hydrate separately). */
    function setUser(next: SessionUser, sync: boolean): void {
        user.value = { name: next.name, email: next.email, plan: next.plan };
        syncOn.value = sync;
    }

    function signOut(): void {
        user.value = null;
        syncOn.value = false;
        cancellationScheduled.value = false;
        proAccessUntil.value = null;
        billingMessage.value = null;
    }

    /** Clear the transient billing message (e.g. after the user dismisses it). */
    function dismissBillingMessage(): void {
        billingMessage.value = null;
    }

    /**
     * Optimistically set the plan and persist it, then reconcile with the billing
     * seam's response, which has three shapes:
     *
     *  (a) `checkoutUrl` present (Stripe upgrade) — revert the optimistic flip and
     *      redirect to Checkout; the webhook applies Pro only after payment.
     *  (b) `cancellationScheduled` true (end-of-period cancel, FR-9) — do NOT flip
     *      to Free; keep the current (Pro) plan and record `proAccessUntil` so the
     *      UI can show "Pro until <date>". The `subscription.deleted` webhook flips
     *      the plan to Free later, at period end.
     *  (c) neither (direct/dev apply) — the optimistic flip stands.
     *
     * On error (e.g. 503 billing unavailable, FR-2) revert the flip and surface a
     * user-visible message rather than only logging.
     */
    function setPlan(next: Plan): Promise<void> {
        if (!user.value) return Promise.resolve();
        const previous = user.value.plan;
        billingMessage.value = null;
        user.value.plan = next;
        return account
            .changePlan(next)
            .then((res) => {
                const result = res?.data;
                if (result?.checkoutUrl) {
                    if (user.value) user.value.plan = previous;
                    window.location.href = result.checkoutUrl;
                    return;
                }
                if (result?.cancellationScheduled) {
                    if (user.value) user.value.plan = previous;
                    cancellationScheduled.value = true;
                    proAccessUntil.value = result.proAccessUntil
                        ? result.proAccessUntil.toISOString()
                        : null;
                    return;
                }
                cancellationScheduled.value = false;
                proAccessUntil.value = null;
            })
            .catch((e) => {
                if (user.value) user.value.plan = previous;
                billingMessage.value = BILLING_UNAVAILABLE_MESSAGE;
                console.error('[session] plan change failed', e);
            });
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
        cancellationScheduled,
        proAccessUntil,
        proAccessUntilLabel,
        billingMessage,
        setUser,
        signOut,
        setPlan,
        setSync,
        dismissBillingMessage,
    };
});
