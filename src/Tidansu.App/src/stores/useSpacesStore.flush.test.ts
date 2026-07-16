/**
 * B-15 T-34.7 / T-34.11 / T-34.12 — verification of the store's flush orchestration.
 *
 * These three acceptance criteria live in `flush()`, not in the API, so the backend
 * drive (curl + EF SQL log) cannot reach them. They are also the three riskiest
 * behaviours in B-15 — all three are silent-data-loss shaped — and two of them
 * (T-34.11 / T-34.12) are fixes for bugs the `design-an-interface` exploration found
 * in the original plan, which had never been exercised before this file existed.
 *
 * Driving them by hand in a browser is unreliable: each requires a specific
 * interleaving inside a 400 ms debounce window. Mocking the API boundary and
 * driving the store directly proves the same behaviour deterministically.
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = {
    list: vi.fn(async () => []),
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
    SPACES_QUERY_KEY: ['spaces'],
}));
// Partial mock: the real pure module is used throughout, but `applyRollback` is spyable
// so T-34.12c can force an unexpected throw from inside the flush.
vi.mock('@/data/pendingChanges', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/data/pendingChanges')>();
    return { ...actual, applyRollback: vi.fn(actual.applyRollback) };
});

import { applyRollback } from '@/data/pendingChanges';
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

describe('B-15 store flush orchestration', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        vi.useFakeTimers();
        Object.values(api).forEach((f) => f.mockResolvedValue(undefined as never));
    });

    // ---- T-34.7 · FR-11 partial failure -------------------------------------------
    it('T-34.7: a 403 on one item does not revert a sibling edit that already saved', async () => {
        const store = useSpacesStore();
        const space = seedSpace(store);

        api.addItem.mockRejectedValueOnce(new PlanError('items'));  // the new item trips the cap
        store.updateItem(space.id, 'item_a', { name: 'Oat milk' }); // sibling edit — must survive
        store.addItemStructured(space.id, 'Butter', 'zone_existing', 1);

        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        await vi.runAllTimersAsync();

        expect(openPaywall).toHaveBeenCalledWith('items');
        // the rejected add is rolled back...
        expect(space.items.find((i) => i.name === 'Butter')).toBeUndefined();
        // ...but the sibling rename is NOT re-fetched away (the old hydrate(true) bug)
        expect(space.items.find((i) => i.id === 'item_a')!.name).toBe('Oat milk');
        expect(api.list).not.toHaveBeenCalled();
    });

    // ---- T-34.11 · BUG 1 — the phase-2 drop rule ----------------------------------
    it('T-34.11: a reassigning UPDATE into a failed zone-add is dropped, not sent', async () => {
        const store = useSpacesStore();
        const space = seedSpace(store);

        api.addZone.mockRejectedValueOnce(new PlanError('zones')); // phase-1 zone add fails
        const newZone = store.addZoneColumn(space.id, 1)!;         // zone Z (will fail)
        store.addItemStructured(space.id, 'NewInZ', newZone.id, 1); // add targeting Z
        store.updateItem(space.id, 'item_a', { zoneId: newZone.id }); // REASSIGN into Z

        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        await vi.runAllTimersAsync();

        expect(openPaywall).toHaveBeenCalledWith('zones');
        // Neither item op may reach the server — Z does not exist there.
        expect(api.addItem).not.toHaveBeenCalled();
        // This is the assertion an add-only drop rule would FAIL:
        expect(api.updateItem).not.toHaveBeenCalled();
    });

    it('T-34.11b: an update staying in an existing zone is unaffected by a failed zone-add', async () => {
        const store = useSpacesStore();
        const space = seedSpace(store);

        api.addZone.mockRejectedValueOnce(new PlanError('zones'));
        store.addZoneColumn(space.id, 1);
        store.updateItem(space.id, 'item_a', { name: 'Renamed' }); // stays in zone_existing

        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        await vi.runAllTimersAsync();

        expect(api.updateItem).toHaveBeenCalledTimes(1); // must NOT be dropped
    });

    // ---- M2 (review) — a failed space create must not re-sync the account ---------
    /**
     * Regression for review finding M2. A cap-rejected space CREATE used to call
     * `hydrate(true)`, replacing every `Space` object in the store — while the per-space
     * `ChangeSet`s survived, still holding ops staged against the *old* objects. So a
     * rejection on space B could silently discard in-flight edits to space A, the exact
     * cross-contamination FR-11 forbids. Before B-15 a re-sync was harmless (no pending
     * per-entity state existed); this task made it unsafe.
     */
    it('M2: a cap-rejected space create rolls back only that space, never the account', async () => {
        const store = useSpacesStore();
        const spaceA = seedSpace(store);

        store.updateItem(spaceA.id, 'item_a', { name: 'Edit on A' }); // pending edit on A

        api.create.mockRejectedValueOnce(new PlanError('spaces'));
        store.addSpace({ ...spaceA, id: 'space_2', name: 'B', zones: [], items: [] } as never);
        await vi.runAllTimersAsync();

        expect(openPaywall).toHaveBeenCalledWith('spaces');
        expect(store.spaces.find((s) => s.id === 'space_2')).toBeUndefined(); // B rolled back
        expect(api.list).not.toHaveBeenCalled();                              // no re-sync

        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        await vi.runAllTimersAsync();
        // A's edit survived the rejection and still reached the server.
        expect(api.updateItem).toHaveBeenCalledTimes(1);
        expect(spaceA.items.find((i) => i.id === 'item_a')!.name).toBe('Edit on A');
    });

    // ---- BUG 3 (review C1) — zone deletes must not race item ops ------------------
    /**
     * Found by the branch review, not by the T-34 drive (it lives in flush ordering, and
     * the drive's curl path can't produce a same-window move-then-delete).
     *
     * Move item A out of zone Z1 and delete Z1 in the SAME window. The server cascade
     * matches on the *persisted* ZoneId, which is still Z1 until A's PUT lands. So if
     * `DELETE /zones/Z1` is fired concurrently with `PUT /items/A`, roughly half the time
     * the cascade deletes A — the item the user just moved to safety — and A's PUT then
     * 404s. Silent data loss, visible only on reload.
     *
     * Zone deletes therefore have to wait for item ops to settle. Nothing needs the
     * reverse order: `stageZoneDelete` already annihilates pending changes for items
     * still inside the doomed zone.
     */
    it('BUG3: a zone delete waits for item ops to settle (no cascade race)', async () => {
        const store = useSpacesStore();
        const space = seedSpace(store);
        const order: string[] = [];

        let releaseItem!: () => void;
        api.updateItem.mockImplementationOnce(() => {
            order.push('item:start');
            return new Promise<void>((res) => {
                releaseItem = () => { order.push('item:done'); res(); };
            }) as never;
        });
        api.removeZone.mockImplementationOnce(async () => { order.push('zone:delete'); });

        // add a second zone to move into, already server-known
        space.zones.push({ ...space.zones[0]!, id: 'zone_other', label: 'Other' } as never);
        store.updateItem(space.id, 'item_a', { zoneId: 'zone_other' }); // move A OUT of zone_existing
        store.deleteZone(space.id, 'zone_existing');                    // ...and delete its old zone

        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        // The item PUT is in flight. The zone DELETE must NOT have been fired yet.
        expect(order).toEqual(['item:start']);
        expect(api.removeZone).not.toHaveBeenCalled();

        releaseItem();
        await vi.runAllTimersAsync();

        expect(order).toEqual(['item:start', 'item:done', 'zone:delete']);
    });

    // ---- T-34.12 · BUG 2 — flush serialization ------------------------------------
    it('T-34.12: flushes serialize per space; an edit mid-flight is not lost', async () => {
        const store = useSpacesStore();
        const space = seedSpace(store);

        let release!: () => void;
        api.updateItem.mockImplementationOnce(
            () => new Promise<void>((res) => { release = () => res(); }) as never);

        store.updateItem(space.id, 'item_a', { name: 'First' });
        await vi.advanceTimersByTimeAsync(DEBOUNCE);      // flush #1 starts, hangs in-flight
        expect(api.updateItem).toHaveBeenCalledTimes(1);

        store.updateItem(space.id, 'item_a', { name: 'Second' }); // arrives mid-flight
        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        // no overlapping flush was started while #1 was still in the air
        expect(api.updateItem).toHaveBeenCalledTimes(1);

        release();
        await vi.runAllTimersAsync();

        // the mid-flight edit was absorbed by the next window, not dropped
        expect(api.updateItem).toHaveBeenCalledTimes(2);
        expect(space.items.find((i) => i.id === 'item_a')!.name).toBe('Second');
    });

    it('T-34.12b: a failed send does not wedge the space (rejection path)', async () => {
        const store = useSpacesStore();
        const space = seedSpace(store);

        api.updateItem.mockRejectedValueOnce(new Error('network down'));
        store.updateItem(space.id, 'item_a', { name: 'Boom' });
        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        await vi.runAllTimersAsync();

        store.updateItem(space.id, 'item_a', { name: 'After failure' });
        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        await vi.runAllTimersAsync();

        expect(api.updateItem).toHaveBeenCalledTimes(2);
    });

    /**
     * The `finally` in `flush()` is defence-in-depth, and this pins it.
     *
     * A rejected *send* can never reach it: `runSends` uses `Promise.allSettled`, so a
     * network failure becomes a result rather than an exception (that is what T-34.12b
     * above covers). The `finally` exists for an *unexpected* throw — a bug in
     * `takeFlushPlan`/`applyRollback`, or a future edit that introduces one. Without it,
     * such a throw leaves the space id in `inFlight` forever and every later flush
     * silently re-arms and returns: that space's autosave is dead for the session, with
     * no error surfaced. This test therefore forces a throw from inside the flush and
     * asserts the *next* edit still sends. Verified to have teeth by deleting the
     * `finally` and watching it fail.
     */
    it('T-34.12c: an unexpected throw inside the flush does not wedge autosave forever', async () => {
        const store = useSpacesStore();
        const space = seedSpace(store);

        // applyRollback is only reached on failure — make it blow up there.
        vi.mocked(applyRollback).mockImplementationOnce(() => {
            throw new Error('unexpected bug inside rollback');
        });
        api.updateItem.mockRejectedValueOnce(new PlanError('items'));

        store.updateItem(space.id, 'item_a', { name: 'Triggers the throw' });
        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        await vi.runAllTimersAsync().catch(() => undefined);

        // If `finally` were missing, inFlight would still hold 'space_1' and this never sends.
        store.updateItem(space.id, 'item_a', { name: 'Must still save' });
        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        await vi.runAllTimersAsync();

        expect(api.updateItem).toHaveBeenCalledTimes(2);
    });
});
