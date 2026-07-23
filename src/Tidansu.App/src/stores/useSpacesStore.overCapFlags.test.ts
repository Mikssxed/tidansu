/**
 * B-25 T-12 — verification of `useSpacesStore.refreshOverCapFlags()`'s merge-only
 * contract and its FR-3 triggers (plan-watch, delete success).
 *
 * The merge-not-replace guarantee (never pushing/removing/replacing a `Space` object)
 * is a data-integrity property a manual browser drive cannot observe — only an object-
 * identity assertion can prove it wasn't silently violated (the M2 hazard `hydrate(true)`
 * is banned for, see `handleCreateError`'s doc). Mocking the API boundary and the
 * session store also makes the plan-flip and delete triggers deterministic, the same
 * rationale as `useSpacesStore.hydrate.test.ts` and `.saveMessage.test.ts`.
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import type { Space } from '@/data/types';

const api = {
    listPage: vi.fn(async () => ({ spaces: [] as Space[], total: 0, page: 1, pageSize: 20 })),
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

/**
 * `useSessionStore` is mocked with a plain reactive object rather than the real Pinia
 * store — the real one reads `localStorage` at setup time, which doesn't exist under
 * this file's node test environment (see `vite.config.ts`'s test-scope comment).
 *
 * Reassigned (not just mutated) per test in `resetSession()`: a store instantiated in
 * an earlier test captured the *previous* object's reference via `useSessionStore()`
 * and registered its `session.plan` watch against it. If tests shared one mutable
 * object, that earlier store's still-live watcher would react to a later test's
 * mutations too, double-counting `listPage` calls. Giving each test its own fresh
 * object means only the current test's store (created after `resetSession()`) ever
 * observes its mutations.
 */
let session = reactive({ plan: 'pro' as 'free' | 'pro', planChangeEpoch: 0, caps: { spaces: Infinity } });
function resetSession(): void {
    session = reactive({ plan: 'pro' as 'free' | 'pro', planChangeEpoch: 0, caps: { spaces: Infinity } });
}

vi.mock('@/composables/useApiClient', () => ({ useApiClient: () => ({}) }));
vi.mock('@/composables/useLimits', () => ({ openPaywall: (r: string) => openPaywall(r) }));
vi.mock('@/composables/useSpacesApi', () => ({
    useSpacesApi: () => api,
    planReasonOf: () => null,
}));
vi.mock('@/stores/useSessionStore', () => ({
    useSessionStore: () => session,
}));
vi.mock('@/queryClient', () => ({
    queryClient: {
        fetchQuery: vi.fn(({ queryFn }: { queryFn: () => Promise<unknown> }) => queryFn()),
        setQueryData: vi.fn(),
        removeQueries: vi.fn(),
    },
    spacesQueryKey: (page: number) => ['spaces', page],
    spaceContentsKey: (id: string) => ['space', id],
}));

import { queryClient } from '@/queryClient';
import { useSpacesStore } from './useSpacesStore';

function makeSummary(id: string, overCap: boolean): Space {
    return {
        id,
        name: id,
        type: 'fridge',
        viewMode: 'layout',
        canvasMode: 'columns',
        layoutColumns: 1,
        columnLabels: null,
        zones: [],
        items: [],
        itemCount: 0,
        zoneCount: 0,
        previewColors: [],
        overCap,
    };
}

async function hydrateWith(
    store: ReturnType<typeof useSpacesStore>,
    spaces: Space[],
    total: number
): Promise<void> {
    api.listPage.mockResolvedValueOnce({ spaces, total, page: 1, pageSize: 20 });
    await store.hydrate(true);
}

/** Flushes both microtasks and the promise chains started by fire-and-forget `void` calls. */
async function flushPromises(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('B-25 refreshOverCapFlags', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        resetSession();
    });

    it('1: merges overCap by id onto the same object references, preserving fields set beforehand', async () => {
        const store = useSpacesStore();
        await hydrateWith(store, [makeSummary('space_1', false), makeSummary('space_2', false)], 2);
        const s1 = store.getById('space_1')!;
        const s2 = store.getById('space_2')!;
        // Simulate contents already loaded locally — must survive the merge untouched.
        s1.zones = [{ id: 'zone_1' } as never];
        s1.items = [{ id: 'item_1' } as never];

        api.listPage.mockResolvedValueOnce({
            spaces: [makeSummary('space_1', true), makeSummary('space_2', false)],
            total: 2,
            page: 1,
            pageSize: 20,
        });
        await store.refreshOverCapFlags();

        expect(store.getById('space_1')).toBe(s1); // same object reference — never replaced
        expect(store.getById('space_2')).toBe(s2);
        expect(s1.overCap).toBe(true);
        expect(s2.overCap).toBe(false);
        expect(s1.zones).toEqual([{ id: 'zone_1' }]);
        expect(s1.items).toEqual([{ id: 'item_1' }]);
    });

    it('2: a plan flip triggers exactly one refetch of the loaded pages', async () => {
        const store = useSpacesStore();
        await hydrateWith(store, [makeSummary('space_1', false)], 1);
        api.listPage.mockClear();
        api.listPage.mockResolvedValueOnce({
            spaces: [makeSummary('space_1', true)],
            total: 1,
            page: 1,
            pageSize: 20,
        });

        session.plan = 'free';
        await flushPromises();

        expect(api.listPage).toHaveBeenCalledTimes(1);
        expect(store.getById('space_1')!.overCap).toBe(true);
    });

    it('3: delete success triggers a refresh when the cap is finite, and skips it on Pro', async () => {
        session.caps.spaces = Infinity; // Pro
        const store = useSpacesStore();
        await hydrateWith(store, [makeSummary('space_1', false), makeSummary('space_2', false)], 2);
        api.listPage.mockClear();

        store.deleteSpace('space_1');
        await flushPromises();
        expect(api.listPage).not.toHaveBeenCalled(); // Pro: isInf skips the refresh

        session.caps.spaces = 2; // Free
        api.listPage.mockResolvedValueOnce({
            spaces: [makeSummary('space_2', true)],
            total: 1,
            page: 1,
            pageSize: 20,
        });
        store.deleteSpace('space_2');
        await flushPromises();
        expect(api.listPage).toHaveBeenCalledTimes(1);
    });

    it('4: not hydrated ⇒ refreshOverCapFlags issues no request', async () => {
        const store = useSpacesStore();
        expect(store.hydrated).toBe(false);

        await store.refreshOverCapFlags();

        expect(api.listPage).not.toHaveBeenCalled();
    });

    it('5: a settlement pulse (planChangeEpoch) alone triggers a refetch (review M1)', async () => {
        const store = useSpacesStore();
        await hydrateWith(store, [makeSummary('space_1', false)], 1);
        api.listPage.mockClear();
        api.listPage.mockResolvedValueOnce({
            spaces: [makeSummary('space_1', true)],
            total: 1,
            page: 1,
            pageSize: 20,
        });

        // `plan` itself is unchanged here — mirrors `setPlan`'s revert branches (checkout
        // redirect, scheduled cancel, billing error), which still settle and bump the
        // epoch without ever changing the plan value.
        session.planChangeEpoch += 1;
        await flushPromises();

        expect(api.listPage).toHaveBeenCalledTimes(1);
        expect(store.getById('space_1')!.overCap).toBe(true);
    });

    it('6: a refresh requested while a hydrate is in flight is deferred, not dropped (review N1)', async () => {
        const store = useSpacesStore();
        await hydrateWith(store, [makeSummary('space_1', false)], 1);
        api.listPage.mockClear();

        let resolveHydrate!: (v: unknown) => void;
        api.listPage.mockReturnValueOnce(
            new Promise((resolve) => {
                resolveHydrate = resolve;
            }) as never
        );
        const pending = store.hydrate(true);
        expect(store.isHydrating).toBe(true);

        // A refresh trigger (e.g. the plan watch) fires mid-hydrate — it must not be
        // dropped, but it also must not fire its own request while the hydrate owns the
        // in-flight slot.
        api.listPage.mockResolvedValueOnce({
            spaces: [makeSummary('space_1', true)],
            total: 1,
            page: 1,
            pageSize: 20,
        });
        await store.refreshOverCapFlags();
        expect(api.listPage).toHaveBeenCalledTimes(1); // only the hydrate's own request so far

        resolveHydrate({ spaces: [makeSummary('space_1', false)], total: 1, page: 1, pageSize: 20 });
        await pending;
        await flushPromises();

        // The deferred refresh replays once hydrate settles, and its result — not the
        // stale-under-Pro hydrate response — is what the space ends up badged with.
        expect(api.listPage).toHaveBeenCalledTimes(2);
        expect(store.getById('space_1')!.overCap).toBe(true);
    });

    it('7: a reset() mid-refresh is not re-armed by a still-pending response (review N2)', async () => {
        const store = useSpacesStore();
        await hydrateWith(store, [makeSummary('space_1', false)], 1);
        api.listPage.mockClear();

        let resolveRefresh!: (v: unknown) => void;
        api.listPage.mockReturnValueOnce(
            new Promise((resolve) => {
                resolveRefresh = resolve;
            }) as never
        );
        const refreshPromise = store.refreshOverCapFlags();

        store.reset(); // sign-out mid-refresh — bumps hydrateEpoch, zeroes total, clears spaces

        resolveRefresh({ spaces: [makeSummary('space_1', true)], total: 1, page: 1, pageSize: 20 });
        await refreshPromise;

        // The orphaned refresh must not resurrect the signed-out space or stomp the
        // reset's `total` back from under it.
        expect(store.spaces).toHaveLength(0);
        expect(store.getById('space_1')).toBeNull();
        expect(store.count).toBe(0);
    });

    it("8: refreshOverCapFlags writes each refetched page back into the query cache (review N3)", async () => {
        const store = useSpacesStore();
        await hydrateWith(store, [makeSummary('space_1', false)], 1);
        vi.mocked(queryClient.setQueryData).mockClear();

        const page1 = { spaces: [makeSummary('space_1', true)], total: 1, page: 1, pageSize: 20 };
        api.listPage.mockResolvedValueOnce(page1);
        await store.refreshOverCapFlags();

        expect(queryClient.setQueryData).toHaveBeenCalledWith(['spaces', 1], page1);
    });
});
