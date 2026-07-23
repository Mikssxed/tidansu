/**
 * B-26 T-12 — verification of `loadSpaceContents`'s single-space over-cap flag flow.
 *
 * `GET /api/spaces/{id}` now carries the server's `IsOverCap` truth (via
 * `SpaceReadDto`/`toSpace`), so a deep link into a space the store has never seen
 * via the summaries list must still badge correctly. Two shapes to prove, mirroring
 * `useSpacesStore.overCapFlags.test.ts`'s rationale for testing this over a manual
 * drive: the cold-cache push path (unknown id) carries the flag through on arrival,
 * and the known-id merge path assigns the flag onto the *same* object reference
 * (never replaces it) per the merge-only contract every other over-cap refresh path
 * in this store follows.
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Space } from '@/data/types';

const api = {
    listPage: vi.fn(async () => ({ spaces: [] as Space[], total: 0, page: 1, pageSize: 20 })),
    get: vi.fn(async (): Promise<Space | undefined> => undefined),
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
    isNotFoundError: () => false,
}));
// B-25: the store composes `useSessionStore` (plan-watch trigger for
// `refreshOverCapFlags`) — the real store reads `localStorage`, absent under this
// file's node test environment. Fixed Pro plan/cap: this suite isn't exercising the
// plan-watch refresh, so a never-firing watch is correct here.
vi.mock('@/stores/useSessionStore', () => ({
    useSessionStore: () => ({ plan: 'pro', planChangeEpoch: 0, caps: { spaces: Infinity } }),
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

function makeFull(id: string, overCap: boolean): Space {
    return {
        ...makeSummary(id, overCap),
        zones: [{ id: 'zone_1' } as never],
        items: [{ id: 'item_1' } as never],
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

describe('B-26 loadSpaceContents over-cap flag', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
    });

    it('1: an unknown-id deep link pushes the fetched space with its over-cap flag intact', async () => {
        const store = useSpacesStore();
        api.get.mockResolvedValueOnce(makeFull('space_9', true));

        const result = await store.loadSpaceContents('space_9');

        expect(result).toBe('ok');
        const space = store.getById('space_9');
        expect(space).not.toBeNull();
        expect(space!.overCap).toBe(true);
    });

    it('2: a known-id fetch merges over-cap onto the same object reference, leaving siblings untouched', async () => {
        const store = useSpacesStore();
        await hydrateWith(store, [makeSummary('space_1', false)], 1);
        const s1 = store.getById('space_1')!;

        api.get.mockResolvedValueOnce(makeFull('space_1', true));
        await store.loadSpaceContents('space_1');

        expect(store.getById('space_1')).toBe(s1); // same object reference — never replaced
        expect(s1.overCap).toBe(true);
        expect(s1.zones).toEqual([{ id: 'zone_1' }]);
        expect(s1.items).toEqual([{ id: 'item_1' }]);
    });
});
