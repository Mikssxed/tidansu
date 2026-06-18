import { parseAdd, matchZone } from '@/data/items';
import { seedFridge } from '@/data/seed';
import { flowFreeform, makeZone, uid } from '@/data/spaces';
import type { Item, Rect, Space, ViewMode, Zone, ZoneKind } from '@/data/types';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

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

const STORAGE_KEY = 'tidansu_spaces';

function load(): Space[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw) as Space[];
    } catch {
        localStorage.removeItem(STORAGE_KEY);
        return [];
    }
}

/**
 * Local (this-device) store of spaces, mirroring the prototype's localStorage
 * shape. Phase 3 needs starter-space seeding; CRUD (create/rename/duplicate/
 * delete) is added in Phase 4.
 */
export const useSpacesStore = defineStore('spaces', () => {
    const spaces = ref<Space[]>(load());
    const currentId = ref<string | null>(null);

    watch(
        spaces,
        (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value)),
        { deep: true }
    );

    const count = computed(() => spaces.value.length);
    const currentSpace = computed(
        () => spaces.value.find((s) => s.id === currentId.value) ?? null
    );

    function getById(id: string): Space | null {
        return spaces.value.find((s) => s.id === id) ?? null;
    }

    /** Seed the starter fridge on first sign-in (only when the device has none). */
    function seedStarterIfEmpty(): void {
        if (spaces.value.length === 0) {
            spaces.value.push(seedFridge());
        }
    }

    /** Append a freshly built space (from the onboarding flow). Returns its id. */
    function addSpace(space: Space): string {
        spaces.value.push(space);
        return space.id;
    }

    function renameSpace(id: string, name: string): void {
        const space = getById(id);
        if (space) space.name = name.trim() || space.name;
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
        return copy.id;
    }

    function deleteSpace(id: string): void {
        spaces.value = spaces.value.filter((s) => s.id !== id);
        if (currentId.value === id) currentId.value = null;
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
        return item;
    }

    function removeItem(spaceId: string, itemId: string): void {
        const space = getById(spaceId);
        if (space) space.items = space.items.filter((it) => it.id !== itemId);
    }

    function updateItem(spaceId: string, itemId: string, patch: Partial<Item>): void {
        const space = getById(spaceId);
        const item = space?.items.find((it) => it.id === itemId);
        if (item) Object.assign(item, patch);
    }

    function setViewMode(spaceId: string, mode: ViewMode): void {
        const space = getById(spaceId);
        if (space) space.viewMode = mode;
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
        return zone;
    }

    function updateZone(spaceId: string, zoneId: string, patch: Partial<Zone>): void {
        const space = getById(spaceId);
        const zone = space?.zones.find((z) => z.id === zoneId);
        if (zone) Object.assign(zone, patch);
    }

    /** Delete a zone and any items inside it. */
    function deleteZone(spaceId: string, zoneId: string): void {
        const space = getById(spaceId);
        if (!space) return;
        space.zones = space.zones.filter((z) => z.id !== zoneId);
        space.items = space.items.filter((it) => it.zoneId !== zoneId);
    }

    /** Switch a columns-mode space to the free canvas, flowing existing zones into place. */
    function convertToFreeform(spaceId: string): void {
        const space = getById(spaceId);
        if (!space) return;
        space.canvasMode = 'freeform';
        space.layoutColumns = 1;
        space.columnLabels = null;
        flowFreeform(space.zones);
    }

    return {
        spaces,
        currentId,
        count,
        currentSpace,
        getById,
        seedStarterIfEmpty,
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
