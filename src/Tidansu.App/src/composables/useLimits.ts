import type { PaywallReason } from '@/data/paywall';
import { isInf } from '@/data/plans';
import type { Space } from '@/data/types';
import { useSessionStore } from '@/stores/useSessionStore';
import { useSpacesStore } from '@/stores/useSpacesStore';
import { computed, ref } from 'vue';

export type { PaywallReason };

/**
 * Shared (singleton) paywall state — there is one paywall for the whole app, so
 * the reason lives at module scope and every `useLimits()` call sees the same
 * ref. A single `PaywallModal` (Phase 7, item 3) reads it.
 */
const paywallReason = ref<PaywallReason | null>(null);

/** Open the shared paywall with a reason (also usable outside component setup). */
export function openPaywall(reason: PaywallReason): void {
    paywallReason.value = reason;
}
export function closePaywall(): void {
    paywallReason.value = null;
}

/**
 * Plan-limit gate. Exposes pre-mutate checks that return the blocking paywall
 * `reason` (or `null` when the action is allowed) plus the shared paywall state.
 * Per the product rule, callers check **before every mutate**; on a cap they open
 * the paywall with the matching reason and do not mutate — `guard()` wraps that.
 */
export function useLimits() {
    const session = useSessionStore();
    const spaces = useSpacesStore();

    const isPaywallOpen = computed(() => paywallReason.value !== null);

    /**
     * Ids of spaces beyond the plan's space cap — the same cap as `checkAddSpace`,
     * evaluated positionally instead of as a count. Empty on Pro (unbounded cap).
     *
     * ⚠️ Determinism (the crux of B-17): slices `spaces.spaces` **as-is** — the
     * store's existing order, which mirrors the server's stable `GetSpaces`
     * ordering (`OrderBy(s => s.Id)`). Never re-sort here and never key off
     * creation time or local mutation order, or a different set of spaces would
     * become "the read-only ones" on every render — worse than not flagging at all.
     * A live `computed` over `session.caps` + `spaces.spaces` (both reactive) —
     * downgrade, upgrade, space add and space delete all re-derive it immediately,
     * with no snapshot and no separate "unlock" step.
     */
    const readonlySpaceIds = computed<Set<string>>(() => {
        const cap = session.caps.spaces;
        if (isInf(cap)) return new Set();
        return new Set(spaces.spaces.slice(cap).map((s) => s.id));
    });

    /** Whether a space is read-only because it sits beyond the plan's space cap. */
    function isSpaceReadOnly(id: string): boolean {
        return readonlySpaceIds.value.has(id);
    }

    // ---- pre-mutate checks: return the blocking reason, or null when allowed ----

    /** Block a new/duplicated space once the plan's space cap is reached. */
    function checkAddSpace(): PaywallReason | null {
        const cap = session.caps.spaces;
        return !isInf(cap) && spaces.count >= cap ? 'spaces' : null;
    }

    /** Block a new zone once this space hits the plan's per-space zone cap. */
    function checkAddZone(space: Space): PaywallReason | null {
        const cap = session.caps.zones;
        return !isInf(cap) && space.zones.length >= cap ? 'zones' : null;
    }

    /** Block a new item once this space hits the plan's per-space item cap. */
    function checkAddItem(space: Space): PaywallReason | null {
        const cap = session.caps.items;
        return !isInf(cap) && space.items.length >= cap ? 'items' : null;
    }

    /** Photos are Pro-only. */
    function checkPhoto(): PaywallReason | null {
        return session.caps.photos ? null : 'photos';
    }

    /** Cross-device sync is Pro-only. */
    function checkSync(): PaywallReason | null {
        return session.caps.sync ? null : 'sync';
    }

    /**
     * Gate a mutation on a pre-mutate check. Pass the result of a `check*` call:
     * when it yields a reason the paywall opens and this returns `false` (the
     * caller must not mutate); returns `true` when the action is allowed.
     */
    function guard(reason: PaywallReason | null): boolean {
        if (reason) {
            openPaywall(reason);
            return false;
        }
        return true;
    }

    return {
        paywallReason,
        isPaywallOpen,
        openPaywall,
        closePaywall,
        readonlySpaceIds,
        isSpaceReadOnly,
        checkAddSpace,
        checkAddZone,
        checkAddItem,
        checkPhoto,
        checkSync,
        guard,
    };
}
