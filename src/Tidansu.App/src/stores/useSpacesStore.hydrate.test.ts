/**
 * B-18 U-2 — verification of `hydrate`'s loading/failed/retry state machine.
 *
 * FR-3 (no phantom starter-fridge write after a failed fetch) is data-integrity
 * shaped and depends on a rejection interleaving that is unreliable to drive by hand
 * — the same rationale that produced `useSpacesStore.flush.test.ts`. Mocking the API
 * boundary and driving the store directly proves the seed never fires on a failure,
 * and that a later `hydrate()` isn't short-circuited by a stale `hydrated` flag.
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

vi.mock('@/composables/useApiClient', () => ({ useApiClient: () => ({}) }));
vi.mock('@/composables/useLimits', () => ({ openPaywall: (r: string) => openPaywall(r) }));
vi.mock('@/composables/useSpacesApi', () => ({
    useSpacesApi: () => api,
    planReasonOf: () => null,
}));
vi.mock('@/queryClient', () => ({
    // The non-forced path in `hydrate` routes through `fetchQuery` — mimic its real
    // behaviour just enough (invoke the passed `queryFn`) so the non-forced case
    // (test 4) exercises the same success/failure transitions as the forced path.
    queryClient: {
        fetchQuery: vi.fn(({ queryFn }: { queryFn: () => Promise<unknown> }) => queryFn()),
        setQueryData: vi.fn(),
        removeQueries: vi.fn(),
    },
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

describe('B-18 store hydrate state machine', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
    });

    it('1: a rejected listPage sets isHydrateFailed, leaves hydrated false, and never seeds a phantom space', async () => {
        const store = useSpacesStore();
        api.listPage.mockRejectedValueOnce(new Error('network down'));

        await store.hydrate(true);

        expect(store.isHydrateFailed).toBe(true);
        expect(store.hydrated).toBe(false);
        expect(store.spaces).toHaveLength(0);
        expect(api.create).not.toHaveBeenCalled(); // no phantom starter fridge
    });

    it('2: hydrate(true) after a failure can still succeed and populate the grid', async () => {
        const store = useSpacesStore();
        api.listPage.mockRejectedValueOnce(new Error('network down'));
        await store.hydrate(true);
        expect(store.isHydrateFailed).toBe(true);

        api.listPage.mockResolvedValueOnce({
            spaces: [{ id: 'space_1', name: 'Fridge' } as never],
            total: 1,
            page: 1,
            pageSize: 20,
        });
        await store.hydrate(true);

        expect(store.isHydrateFailed).toBe(false);
        expect(store.hydrated).toBe(true);
        expect(store.spaces).toHaveLength(1);
    });

    it('3: a genuinely empty successful response still seeds the starter fridge (no regression)', async () => {
        const store = useSpacesStore();
        api.listPage.mockResolvedValueOnce({ spaces: [], total: 0, page: 1, pageSize: 20 });

        await store.hydrate(true);

        expect(store.hydrated).toBe(true);
        expect(store.isHydrateFailed).toBe(false);
        expect(api.create).toHaveBeenCalledTimes(1);
    });

    it('4: a plain hydrate() after a failure is not short-circuited by a stale hydrated flag', async () => {
        const store = useSpacesStore();
        api.listPage.mockRejectedValueOnce(new Error('network down'));
        await store.hydrate(true);
        expect(store.hydrated).toBe(false); // the load-bearing FR-3 guarantee

        api.listPage.mockResolvedValueOnce({ spaces: [], total: 0, page: 1, pageSize: 20 });
        await store.hydrate(); // non-forced; must NOT early-return past the earlier failure

        expect(api.listPage).toHaveBeenCalledTimes(2);
    });

    it('5: isHydrating is true while the fetch is in flight and false once it settles (FR-1)', async () => {
        const store = useSpacesStore();
        let resolveFetch!: (v: unknown) => void;
        api.listPage.mockReturnValueOnce(
            new Promise((resolve) => {
                resolveFetch = resolve;
            }) as never
        );

        expect(store.isHydrating).toBe(false);
        const pending = store.hydrate(true);
        expect(store.isHydrating).toBe(true);

        resolveFetch({ spaces: [], total: 1, page: 1, pageSize: 20 });
        await pending;

        expect(store.isHydrating).toBe(false);
    });

    it("6: reset() clears isHydrateFailed back to 'idle' after a failed hydrate", async () => {
        const store = useSpacesStore();
        api.listPage.mockRejectedValueOnce(new Error('network down'));
        await store.hydrate(true);
        expect(store.isHydrateFailed).toBe(true);

        store.reset();

        expect(store.isHydrateFailed).toBe(false);
        expect(store.isHydrating).toBe(false);
    });

    describe('M1: overlapping hydrate() calls (review finding)', () => {
        it('a losing failure settling after a winning success does not overwrite the winner', async () => {
            const store = useSpacesStore();
            let resolveWinner!: (v: unknown) => void;
            let rejectLoser!: (e: unknown) => void;

            // Call A (e.g. App.vue's boot hydrate) starts first but settles last (loses).
            api.listPage.mockReturnValueOnce(
                new Promise((_, reject) => {
                    rejectLoser = reject;
                }) as never
            );
            const callA = store.hydrate(true);

            // Call B (e.g. useAuth.consume's forced hydrate) starts second, settles first (wins).
            api.listPage.mockReturnValueOnce(
                new Promise((resolve) => {
                    resolveWinner = resolve;
                }) as never
            );
            const callB = store.hydrate(true);

            resolveWinner({ spaces: [{ id: 'space_1', name: 'Fridge' } as never], total: 1, page: 1, pageSize: 20 });
            await callB;
            expect(store.hydrated).toBe(true);
            expect(store.isHydrateFailed).toBe(false);
            expect(store.spaces).toHaveLength(1);

            // The loser settles afterwards — it must not paint the failed state (or clear
            // `hydrated`/`spaces`) over the winner's already-loaded data.
            rejectLoser(new Error('network down'));
            await callA;

            expect(store.isHydrateFailed).toBe(false);
            expect(store.hydrated).toBe(true);
            expect(store.spaces).toHaveLength(1);
        });

        it("reset() mid-flight is not re-armed by a still-pending call's success", async () => {
            const store = useSpacesStore();
            let resolveFetch!: (v: unknown) => void;
            api.listPage.mockReturnValueOnce(
                new Promise((resolve) => {
                    resolveFetch = resolve;
                }) as never
            );

            const pending = store.hydrate(true);
            store.reset();
            expect(store.isHydrating).toBe(false);
            expect(store.hydrated).toBe(false);

            resolveFetch({ spaces: [{ id: 'space_1', name: 'Fridge' } as never], total: 1, page: 1, pageSize: 20 });
            await pending;

            // The orphaned call must not re-arm any state after the sign-out reset.
            expect(store.isHydrating).toBe(false);
            expect(store.isHydrateFailed).toBe(false);
            expect(store.hydrated).toBe(false);
            expect(store.spaces).toHaveLength(0);
        });

        it("reset() mid-flight is not re-armed by a still-pending call's failure", async () => {
            const store = useSpacesStore();
            let rejectFetch!: (e: unknown) => void;
            api.listPage.mockReturnValueOnce(
                new Promise((_, reject) => {
                    rejectFetch = reject;
                }) as never
            );

            const pending = store.hydrate(true);
            store.reset();
            expect(store.isHydrateFailed).toBe(false);

            rejectFetch(new Error('network down'));
            await pending;

            // The orphaned call's catch must not paint the failed state after a sign-out reset.
            expect(store.isHydrateFailed).toBe(false);
            expect(store.hydrated).toBe(false);
        });
    });
});
