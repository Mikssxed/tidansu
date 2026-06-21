import { useApiClient } from '@/composables/useApiClient';
import { openPaywall } from '@/composables/useLimits';
import { planReasonOf, useSpacesApi } from '@/composables/useSpacesApi';
import { matchZone, parseAdd } from '@/data/items';
import { seedFridge } from '@/data/seed';
import { flowFreeform, makeZone, uid } from '@/data/spaces';
import type { Item, Rect, Space, ViewMode, Zone, ZoneKind } from '@/data/types';
import { queryClient, SPACES_QUERY_KEY } from '@/queryClient';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

/** Build a new item, assigning the next free slot index within its zone. */
function makeItem(space: Space, name: string, zoneId: string, quantity: number): Item {
    const slotIndex = space.items.filter((it) => it.zoneId === zoneId).length;
    return {
        id: uid('item'),
        name,
        zoneId,
        quantity,
        tags: [],
        dateAdded: new Date().toISOString(),
        expiry: null,
        photo: null,
        slotIndex,
        depth: 'front',
        level: 1,
    };
}

/**
 * Server-backed store of the user's spaces. Hydrates from `GET /api/spaces` (via the
 * TanStack Query cache) on sign-in/boot, mutates optimistically for instant UI, and
 * persists changes back: create/delete fire immediately, edits are debounced into a
 * whole-space `PUT`. A server plan-limit (403) opens the matching paywall and re-syncs.
 * Action signatures/getters match the pre-API store so views are unchanged.
 */
export const useSpacesStore = defineStore('spaces', () => {
    // Build the client eagerly so the bearer token is read per-request at call time.
    useApiClient();
    const api = useSpacesApi();

    const spaces = ref<Space[]>([]);
    const currentId = ref<string | null>(null);
    const hydrated = ref(false);
    const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const count = computed(() => spaces.value.length);
    const currentSpace = computed(
        () => spaces.value.find((s) => s.id === currentId.value) ?? null
    );

    function getById(id: string): Space | null {
        return spaces.value.find((s) => s.id === id) ?? null;
    }

    // ---- server sync ----

    function handleSyncError(error: unknown): void {
        const reason = planReasonOf(error);
        if (reason) {
            // Server backstop (the client pre-checks): open the paywall and revert.
            openPaywall(reason);
            void hydrate(true);
        } else {
            console.error('[spaces] sync failed', error);
        }
    }

    /** Debounced whole-space PUT, batching rapid edits to one save per space. */
    function scheduleSave(spaceId: string): void {
        const pending = saveTimers.get(spaceId);
        if (pending) clearTimeout(pending);
        saveTimers.set(
            spaceId,
            setTimeout(() => {
                saveTimers.delete(spaceId);
                const space = getById(spaceId);
                if (space) void api.update(space).catch(handleSyncError);
            }, 400)
        );
    }

    function createRemote(space: Space): void {
        void api.create(space).catch(handleSyncError);
    }
    function deleteRemote(id: string): void {
        const pending = saveTimers.get(id);
        if (pending) clearTimeout(pending);
        saveTimers.delete(id);
        void api.remove(id).catch(handleSyncError);
    }

    /** Load spaces from the server; seed a starter fridge when the account has none. */
    async function hydrate(force = false): Promise<void> {
        if (hydrated.value && !force) return;
        const list = force
            ? await api.list()
            : await queryClient.fetchQuery({ queryKey: SPACES_QUERY_KEY, queryFn: () => api.list() });
        if (force) queryClient.setQueryData(SPACES_QUERY_KEY, list);
        spaces.value = list;
        hydrated.value = true;

        if (spaces.value.length === 0) {
            const starter = seedFridge();
            spaces.value.push(starter);
            createRemote(starter);
        }
    }

    /** Clear all local + cached state on sign-out. */
    function reset(): void {
        saveTimers.forEach((t) => clearTimeout(t));
        saveTimers.clear();
        spaces.value = [];
        currentId.value = null;
        hydrated.value = false;
        queryClient.removeQueries({ queryKey: SPACES_QUERY_KEY });
    }

    // ---- spaces ----

    /** Append a freshly built space (from the onboarding flow). Returns its id. */
    function addSpace(space: Space): string {
        spaces.value.push(space);
        createRemote(space);
        return space.id;
    }

    function renameSpace(id: string, name: string): void {
        const space = getById(id);
        if (space) {
            space.name = name.trim() || space.name;
            scheduleSave(id);
        }
    }

    /** Deep-copy a space with fresh ids on the space, zones and items. Returns the new id. */
    function duplicateSpace(id: string): string | null {
        const orig = getById(id);
        if (!orig) return null;

        const zoneIdMap = new Map<string, string>();
        const zones = orig.zones.map((z) => {
            const newId = uid('zone');
            zoneIdMap.set(z.id, newId);
            return { ...z, id: newId, rect: z.rect ? { ...z.rect } : null };
        });
        const items = orig.items.map((it) => ({
            ...it,
            id: uid('item'),
            zoneId: zoneIdMap.get(it.zoneId) ?? it.zoneId,
            tags: [...it.tags],
        }));

        const copy: Space = {
            ...orig,
            id: uid('space'),
            name: `${orig.name} copy`,
            columnLabels: orig.columnLabels ? [...orig.columnLabels] : null,
            zones,
            items,
        };

        const idx = spaces.value.findIndex((s) => s.id === id);
        spaces.value.splice(idx + 1, 0, copy);
        createRemote(copy);
        return copy.id;
    }

    function deleteSpace(id: string): void {
        spaces.value = spaces.value.filter((s) => s.id !== id);
        if (currentId.value === id) currentId.value = null;
        deleteRemote(id);
    }

    // ---- items ----

    /** Smart add: parse "milk, top shelf x2", resolve the zone (hint or first), append. */
    function addItemSmart(spaceId: string, raw: string): Item | null {
        const space = getById(spaceId);
        if (!space || !space.zones.length || !raw.trim()) return null;
        const { name, zoneHint, quantity } = parseAdd(raw);
        if (!name) return null;
        const zone = matchZone(zoneHint, space.zones, space.type) ?? space.zones[0]!;
        const item = makeItem(space, name, zone.id, quantity);
        space.items.push(item);
        scheduleSave(spaceId);
        return item;
    }

    function addItemStructured(
        spaceId: string,
        name: string,
        zoneId: string,
        quantity: number
    ): Item | null {
        const space = getById(spaceId);
        if (!space || !name.trim()) return null;
        const item = makeItem(space, name.trim(), zoneId, quantity);
        space.items.push(item);
        scheduleSave(spaceId);
        return item;
    }

    function removeItem(spaceId: string, itemId: string): void {
        const space = getById(spaceId);
        if (space) {
            space.items = space.items.filter((it) => it.id !== itemId);
            scheduleSave(spaceId);
        }
    }

    function updateItem(spaceId: string, itemId: string, patch: Partial<Item>): void {
        const space = getById(spaceId);
        const item = space?.items.find((it) => it.id === itemId);
        if (item) {
            Object.assign(item, patch);
            scheduleSave(spaceId);
        }
    }

    function setViewMode(spaceId: string, mode: ViewMode): void {
        const space = getById(spaceId);
        if (space) {
            space.viewMode = mode;
            scheduleSave(spaceId);
        }
    }

    // ---- zones (layout editor) ----

    /** Add a shelf to a column (structured/columns mode). Returns the new zone. */
    function addZoneColumn(spaceId: string, column: number): Zone | null {
        const space = getById(spaceId);
        if (!space) return null;
        const zone = makeZone({
            position: space.zones.length + 1,
            colorIndex: space.zones.length,
            column,
        });
        space.zones.push(zone);
        scheduleSave(spaceId);
        return zone;
    }

    /** Add a drawn zone on the free canvas. Returns the new zone. */
    function addZoneFree(spaceId: string, rect: Rect, kind: ZoneKind): Zone | null {
        const space = getById(spaceId);
        if (!space) return null;
        const zone = makeZone({
            position: space.zones.length + 1,
            colorIndex: space.zones.length,
            kind,
            rect,
        });
        space.zones.push(zone);
        scheduleSave(spaceId);
        return zone;
    }

    function updateZone(spaceId: string, zoneId: string, patch: Partial<Zone>): void {
        const space = getById(spaceId);
        const zone = space?.zones.find((z) => z.id === zoneId);
        if (zone) {
            Object.assign(zone, patch);
            scheduleSave(spaceId);
        }
    }

    /** Delete a zone and any items inside it. */
    function deleteZone(spaceId: string, zoneId: string): void {
        const space = getById(spaceId);
        if (!space) return;
        space.zones = space.zones.filter((z) => z.id !== zoneId);
        space.items = space.items.filter((it) => it.zoneId !== zoneId);
        scheduleSave(spaceId);
    }

    /** Switch a columns-mode space to the free canvas, flowing existing zones into place. */
    function convertToFreeform(spaceId: string): void {
        const space = getById(spaceId);
        if (!space) return;
        space.canvasMode = 'freeform';
        space.layoutColumns = 1;
        space.columnLabels = null;
        flowFreeform(space.zones);
        scheduleSave(spaceId);
    }

    return {
        spaces,
        currentId,
        count,
        currentSpace,
        hydrated,
        getById,
        hydrate,
        reset,
        addSpace,
        renameSpace,
        duplicateSpace,
        deleteSpace,
        addItemSmart,
        addItemStructured,
        removeItem,
        updateItem,
        setViewMode,
        addZoneColumn,
        addZoneFree,
        updateZone,
        deleteZone,
        convertToFreeform,
    };
});
