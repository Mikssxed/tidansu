/**
 * B-23 FR-6 regression — confirmed live drive: create wizard ("New space" → pick
 * type → Continue → name it → "Start adding items") left the URL on the client's
 * temp id (`space_xxxx`) forever, even though the server persisted the space under
 * its own CSPRNG id and the store correctly reconciled every bit of *its* state to
 * that id. `GET /api/spaces/{tempId}` then 404s and `SpaceView` spins on "Loading…"
 * with no way out.
 *
 * No prior test exercised this path — every existing create test (see
 * `useSpacesStore.flush.test.ts`'s M2 case) uses a *rejected* `api.create`, so the
 * successful create → reconcile → navigate path was, by construction, unit-test
 * blind. This file closes that gap.
 *
 * Root cause: `reconcileSpaceId`'s router follow-up used to decide whether to
 * `router.replace` by reading `router.currentRoute.value` — the *settled* route —
 * at the moment the create request resolved. `router.push` resolves asynchronously
 * (route guards, lazy chunk loads); a fast API response can beat that navigation to
 * settling, in which case `currentRoute` still names the *previous* page and the
 * check wrongly comes back false, skipping the reconcile-time re-route. The fix
 * (`goToSpace` + `spaceRouteTarget`) tracks the navigation *intent* synchronously
 * instead, so it is immune to how far the router has actually progressed — which is
 * exactly what this file's router mock exercises: `currentRoute` is a static ref
 * that never advances (mimicking the observed race, where the settled route lags
 * behind), so a correct fix must not depend on it at all.
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SERVER_ID = 'space_5gcdBKB4PWHLML5fyGgf5A';

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

// A router mock whose `currentRoute` intentionally never reflects `push`/`replace`
// calls — the exact "settled route lags behind" condition observed live. Any fix
// that (re-)introduces a dependency on `router.currentRoute` to decide whether to
// re-route on reconcile will fail against this mock, the same way the real bug did.
const routerPush = vi.fn(async () => undefined);
const routerReplace = vi.fn(async () => undefined);
const currentRoute = { value: { name: 'spacesNew', params: {} as Record<string, string> } };

vi.mock('@/composables/useApiClient', () => ({ useApiClient: () => ({}) }));
vi.mock('@/composables/useLimits', () => ({ openPaywall: vi.fn() }));
vi.mock('@/composables/useSpacesApi', () => ({
    useSpacesApi: () => api,
    planReasonOf: () => null,
    isNotFoundError: () => false,
}));
vi.mock('@/queryClient', () => ({
    queryClient: { fetchQuery: vi.fn(), setQueryData: vi.fn(), removeQueries: vi.fn() },
    spacesQueryKey: (page: number) => ['spaces', page],
    spaceContentsKey: (id: string) => ['space', id],
}));
vi.mock('vue-router', () => ({
    useRouter: () => ({ push: routerPush, replace: routerReplace, currentRoute }),
}));
// B-25: the store now composes `useSessionStore` (plan-watch trigger for
// `refreshOverCapFlags`) — the real store reads `localStorage`, absent under this
// file's node test environment. Fixed Pro plan/cap: this suite isn't exercising the
// over-cap flag, so a never-firing watch + `isInf`-skipped delete refresh is correct.
vi.mock('@/stores/useSessionStore', () => ({
    useSessionStore: () => ({ plan: 'pro', caps: { spaces: Infinity } }),
}));

import type { Space } from '@/data/types';
import { useSpacesStore } from './useSpacesStore';

function seedForType(): Space {
    return {
        id: 'space_noj0', name: 'My fridge', type: 'fridge', viewMode: 'list',
        canvasMode: 'columns', layoutColumns: 1, columnLabels: null,
        zones: [], items: [],
    } as unknown as Space;
}

describe('B-23 FR-6: create wizard navigates to the SERVER id, not the temp id', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        Object.values(api).forEach((f) => f.mockResolvedValue(undefined as never));
    });

    it('reconciles the route to the server id after a successful create, even though the router mock never settles on the temp id', async () => {
        const store = useSpacesStore();
        const space = seedForType();
        const localId = space.id;

        api.create.mockResolvedValueOnce({ ...space, id: SERVER_ID } as never);

        // Mirrors CreateSpaceView.finish(): optimistic push, then navigate via the
        // store (not a bare router.push) so reconcileSpaceId can find the space route.
        store.addSpace(space);
        store.goToSpace(localId);

        expect(routerPush).toHaveBeenCalledWith({ name: 'space', params: { id: localId } });

        // Let `api.create`'s promise and the reconcile chain settle.
        await vi.waitFor(() => {
            expect(routerReplace).toHaveBeenCalled();
        });

        // The assertion that actually matters: the app is told to land on the
        // SERVER id, never the dead temp id.
        expect(routerReplace).toHaveBeenCalledWith({ name: 'space', params: { id: SERVER_ID } });
        expect(routerReplace).not.toHaveBeenCalledWith({ name: 'space', params: { id: localId } });

        // And the store's own state agrees — no space is left keyed by the temp id.
        expect(store.getById(localId)).toBeNull();
        expect(store.getById(SERVER_ID)).not.toBeNull();
        expect(store.currentId).toBe(SERVER_ID);
    });
});
