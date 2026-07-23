/**
 * B-19 U-3 — verification of the `saveMessage` coalescing latch.
 *
 * `runSends` settles parallel per-op rejections via `Promise.allSettled`, so
 * "several failures land in the same flush window" is precisely the timing case a
 * manual browser drive cannot reliably hit (see `useSpacesStore.flush.test.ts` for
 * the same rationale). Mocking the API boundary and driving the store directly
 * proves the plan-cap no-double-surfacing rule and the `reset()` clear
 * deterministically.
 *
 * **It does not prove the coalescing latch** (B-19 review M3), despite the first
 * case's name. Every raise assigns the same `SAVE_FAILED_MESSAGE`, so asserting the
 * final value cannot distinguish one write from three, and these tests still pass
 * with `raiseSaveMessage`'s early-return deleted. What the first case really pins
 * down is the observable contract users have — N simultaneous non-plan failures
 * surface exactly one generic message and no paywall — which is the guarantee FR-5
 * exists to give. Should the message ever become dynamic, this file needs a real
 * write-counting assertion (spy the setter); see the note on `raiseSaveMessage`.
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = {
    listPage: vi.fn(async () => ({ spaces: [], total: 0, page: 1, pageSize: 20 })),
    get: vi.fn(async () => undefined),
    create: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    updateFields: vi.fn(async () => undefined),
    addZone: vi.fn(async () => undefined),
    updateZone: vi.fn(async () => undefined),
    removeZone: vi.fn(async () => undefined),
    addItem: vi.fn(async () => undefined),
    updateItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
};
const openPaywall = vi.fn();
/** Mimics a server plan-limit rejection the way `planReasonOf` decodes it. */
class PlanError extends Error {
    constructor(public reason: string) { super('plan limit'); }
}

vi.mock('@/composables/useApiClient', () => ({ useApiClient: () => ({}) }));
vi.mock('@/composables/useLimits', () => ({ openPaywall: (r: string) => openPaywall(r) }));
vi.mock('@/composables/useSpacesApi', () => ({
    useSpacesApi: () => api,
    planReasonOf: (e: unknown) => (e instanceof PlanError ? e.reason : null),
}));
vi.mock('@/queryClient', () => ({
    queryClient: { fetchQuery: vi.fn(), setQueryData: vi.fn(), removeQueries: vi.fn() },
    spacesQueryKey: (page: number) => ['spaces', page],
    spaceContentsKey: (id: string) => ['space', id],
}));
// B-25: the store now composes `useSessionStore` (plan-watch trigger for
// `refreshOverCapFlags`) — the real store reads `localStorage`, absent under this
// file's node test environment. Fixed Pro plan/cap: this suite isn't exercising the
// over-cap flag, so a never-firing watch + `isInf`-skipped delete refresh is correct.
vi.mock('@/stores/useSessionStore', () => ({
    useSessionStore: () => ({ plan: 'pro', caps: { spaces: Infinity } }),
}));

import { useSpacesStore } from './useSpacesStore';

const DEBOUNCE = 400;

function seedSpace(store: ReturnType<typeof useSpacesStore>) {
    const space = {
        id: 'space_1', name: 'Fridge', type: 'fridge', viewMode: 'layout',
        canvasMode: 'columns', layoutColumns: 1, columnLabels: null,
        zones: [{
            id: 'zone_existing', position: 1, label: 'Top', color: 'blue', gridCols: 4,
            gridRows: 1, hasDepth: false, floor: false, kind: 'shelf', facing: 'front',
            levels: 1, column: 1, rect: null,
        }],
        items: [{
            id: 'item_a', name: 'Milk', zoneId: 'zone_existing', quantity: 1, tags: [],
            dateAdded: '2026-07-16T00:00:00Z', expiry: null, photo: null,
            slotIndex: 0, depth: 'front', level: 1, icon: null,
        }],
    } as never;
    store.spaces.push(space);
    return store.spaces[0]!;
}

describe('B-19 store saveMessage latch', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        vi.useFakeTimers();
        Object.values(api).forEach((f) => f.mockResolvedValue(undefined as never));
    });

    it('coalesces several simultaneous rejections in one flush window into exactly one message', async () => {
        const store = useSpacesStore();
        const space = seedSpace(store);
        space.zones.push({ ...space.zones[0]!, id: 'zone_other', label: 'Other' } as never);

        api.updateZone.mockRejectedValueOnce(new Error('network down'));
        api.addItem.mockRejectedValueOnce(new Error('network down'));

        store.updateZone(space.id, 'zone_existing', { label: 'Renamed' });
        store.updateZone(space.id, 'zone_other', { label: 'Also renamed' });
        store.addItemStructured(space.id, 'Butter', 'zone_existing', 1);

        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        await vi.runAllTimersAsync();

        expect(store.saveMessage).toBe("Couldn't save your latest changes — please try again.");
        expect(openPaywall).not.toHaveBeenCalled();
    });

    it('a plan-cap rejection opens the paywall and raises no message (no double-surfacing)', async () => {
        const store = useSpacesStore();
        const space = seedSpace(store);

        api.addZone.mockRejectedValueOnce(new PlanError('zones'));
        store.addZoneColumn(space.id, 1);

        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        await vi.runAllTimersAsync();

        expect(openPaywall).toHaveBeenCalledWith('zones');
        expect(store.saveMessage).toBeNull();
    });

    it('reset() clears an active saveMessage', async () => {
        const store = useSpacesStore();
        const space = seedSpace(store);

        api.updateItem.mockRejectedValueOnce(new Error('network down'));
        store.updateItem(space.id, 'item_a', { name: 'Boom' });

        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        await vi.runAllTimersAsync();
        expect(store.saveMessage).not.toBeNull();

        store.reset();

        expect(store.saveMessage).toBeNull();
    });
});
