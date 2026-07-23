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
     * Ids of spaces the plan's space cap makes read-only — badged from the server's
     * own `IsOverCap` truth (B-25), not from array position or `Id` order.
     *
     * B-17 originally sliced `spaces.spaces` positionally, on the assumption that the
     * store's array order mirrors the server's stable `OrderBy(s => s.Id)`. That
     * assumption broke with B-23: `reconcileSpaceId` swaps a space's local id for the
     * server-assigned one in place (no repositioning) and `duplicateSpace` splices a
     * copy mid-array, so array position stopped tracking `Id` order — the SPA could
     * badge a different set of spaces than the server actually rejects mutations for.
     * The server now ships the authoritative determination per space
     * (`SpaceSummaryDto.IsOverCap`, computed with the same
     * `PlanPolicy.CheckSpaceContentMutation` predicate `SpaceOverCapGuard` enforces —
     * see its class doc), and the SPA badges from that flag directly. Never derive
     * over-cap from position, id sorting, or `localeCompare` again.
     *
     * Freshness (FR-3): the `isInf` early-return stays load-bearing — it is what makes
     * an *upgrade* instant, since stale `overCap: true` flags become structurally
     * invisible the moment `session.caps.spaces` flips to unbounded. A *downgrade* (or
     * a delete pulling a sibling back under cap) is covered by
     * `useSpacesStore.refreshOverCapFlags()`, triggered by a `session.plan` watch and
     * by delete success — see that function's doc for the merge-only contract. The
     * single-space read (`GET /{id}`, via `loadSpaceContents`) carries the same
     * server-computed flag as of B-26, so a deep-linked space is badged on load
     * instead of falling back to the server's 403 → `planReasonOf` → paywall path.
     * Still a plain `computed` over `session.caps` + `spaces.spaces` (both reactive) —
     * no snapshot, no watcher here.
     */
    const readonlySpaceIds = computed<Set<string>>(() => {
        if (isInf(session.caps.spaces)) return new Set();
        return new Set(spaces.spaces.filter((s) => s.overCap).map((s) => s.id));
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
