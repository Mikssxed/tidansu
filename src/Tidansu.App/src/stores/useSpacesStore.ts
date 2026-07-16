import { useApiClient } from '@/composables/useApiClient';
import { openPaywall } from '@/composables/useLimits';
import { planReasonOf, useSpacesApi } from '@/composables/useSpacesApi';
import { matchZone, parseAdd } from '@/data/items';
import type { PaywallReason } from '@/data/paywall';
import type { ChangeSet, FlushOperation, FlushPlan } from '@/data/pendingChanges';
import {
    applyRollback,
    createChangeSet,
    isEmpty,
    snapshotForUpdate,
    stageAdd,
    stageDelete,
    stageUpdate,
    stageZoneDelete,
    takeFlushPlan,
} from '@/data/pendingChanges';
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
 * persists changes back: create/delete fire immediately as whole-space POST/DELETE;
 * every other edit is staged into a per-space `ChangeSet` (`@/data/pendingChanges`)
 * and flushed on one 400ms debounce window per space as a two-phase batch of
 * per-entity requests — space-scalar + zone add/update first, then item
 * add/update/delete + zone delete (item ops need their zone to exist server-side
 * first; see `flush`). A rejected mutation rolls back only itself, never the whole
 * space; a plan-limit 403 additionally opens the matching paywall. Per-mutation
 * status is exposed via `saveState` for B-19 to render, not rendered here.
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
    const changeSets = new Map<string, ChangeSet>();
    const inFlight = new Set<string>();
    /** Per-mutation save status, keyed by entity id (or `space:{id}` for scalars). */
    const saveState = ref<Map<string, { status: 'pending' | 'saved' | 'failed'; reason: PaywallReason | null }>>(
        new Map()
    );

    const count = computed(() => spaces.value.length);
    const currentSpace = computed(
        () => spaces.value.find((s) => s.id === currentId.value) ?? null
    );

    function getById(id: string): Space | null {
        return spaces.value.find((s) => s.id === id) ?? null;
    }

    function getOrCreateChangeSet(spaceId: string): ChangeSet {
        let cs = changeSets.get(spaceId);
        if (!cs) {
            cs = createChangeSet();
            changeSets.set(spaceId, cs);
        }
        return cs;
    }

    // ---- server sync ----

    function scalarKey(spaceId: string): string {
        return `space:${spaceId}`;
    }
    function markPending(key: string): void {
        saveState.value.set(key, { status: 'pending', reason: null });
    }
    function markSaved(key: string): void {
        saveState.value.set(key, { status: 'saved', reason: null });
    }
    function markFailed(key: string, reason: PaywallReason | null): void {
        saveState.value.set(key, { status: 'failed', reason });
    }

    /** Forget a space and every scrap of pending state keyed to it. */
    function discardSpaceLocally(spaceId: string): void {
        spaces.value = spaces.value.filter((s) => s.id !== spaceId);
        if (currentId.value === spaceId) currentId.value = null;
        const timer = saveTimers.get(spaceId);
        if (timer) clearTimeout(timer);
        saveTimers.delete(spaceId);
        changeSets.delete(spaceId);
        inFlight.delete(spaceId);
        saveState.value.delete(`space:${spaceId}`);
    }

    /**
     * A failed whole-space CREATE rolls back just that space — it must NOT `hydrate(true)`
     * (review finding M2).
     *
     * A full re-sync replaces every `Space` object in the store, but the per-space
     * `ChangeSet`s survive and still hold ops staged against the *old* objects. Those ops
     * would then flush and land server-side while the UI showed the re-fetched values —
     * i.e. a cap rejection on space B could silently discard the user's in-flight edits to
     * space A, which is precisely what FR-11 forbids. Before B-15 a re-sync was harmless
     * (there was no pending per-entity state); this task is what made it unsafe, so this
     * task fixes it.
     *
     * Create is the only whole-space path that can plan-fail: deleting a space never trips
     * a cap, so `planReasonOf` is null there and it takes the surfaced-error branch.
     */
    function handleCreateError(space: Space, error: unknown): void {
        discardSpaceLocally(space.id);
        const reason = planReasonOf(error);
        if (reason) openPaywall(reason);
        else console.error('[spaces] space create failed', error);
    }

    /** A failed whole-space DELETE: surfaced, never a paywall (deletes never trip a cap). */
    function handleDeleteError(error: unknown): void {
        console.error('[spaces] space delete failed', error);
    }

    /**
     * A rejected per-entity mutation rolls back only itself (FR-11) — it never
     * re-syncs the whole account, which would re-fetch away sibling edits that
     * already succeeded in the same flush window. A plan-limit 403 additionally
     * opens the matching paywall; any other error is still surfaced via
     * `console.error` (not swallowed) with the failure left in `saveState` for
     * B-19 to render.
     */
    function recordFailure(
        space: Space,
        op: FlushOperation<Space | Zone | Item>,
        key: string,
        error: unknown
    ): void {
        applyRollback(space, op);
        const reason = planReasonOf(error);
        if (reason) {
            openPaywall(reason);
        } else {
            console.error('[spaces] sync failed', error);
        }
        markFailed(key, reason);
    }

    function sendZone(spaceId: string, op: FlushOperation<Zone>): Promise<unknown> {
        return op.op === 'add' ? api.addZone(spaceId, op.payload!) : api.updateZone(spaceId, op.payload!);
    }

    function sendItem(spaceId: string, op: FlushOperation<Item>): Promise<unknown> {
        switch (op.op) {
            case 'add':
                return api.addItem(spaceId, op.payload!);
            case 'update':
                return api.updateItem(spaceId, op.payload!);
            case 'delete':
                return api.removeItem(spaceId, op.id);
        }
    }

    /**
     * BUG 1 fix (D-7 / SC-6). Drop a phase-2 item op whose *target* zone — the
     * payload's `zoneId`, i.e. where the item lands after the op — belongs to a
     * zone whose phase-1 `add` just failed. Covers a fresh item add into that zone
     * **and** an FR-5 update reassigning an existing item into it; an earlier draft
     * of this plan only covered adds. Item-`delete` has no target zone and is never
     * dropped; an update staying in an existing, already-server-known zone is
     * unaffected.
     */
    function isTargetingFailedZone(op: FlushOperation<Item>, failedZoneAdds: Set<string>): boolean {
        if (op.op === 'delete' || !op.payload) return false;
        return failedZoneAdds.has(op.payload.zoneId);
    }

    interface PendingSend {
        readonly op: FlushOperation<Space | Zone | Item>;
        readonly key: string;
        readonly send: () => Promise<unknown>;
    }

    /** Fires every send in parallel, settles them all, and records saveState + rollback per op. */
    async function runSends(
        space: Space,
        sends: PendingSend[]
    ): Promise<{ op: FlushOperation<Space | Zone | Item>; ok: boolean }[]> {
        for (const s of sends) markPending(s.key);
        const results = await Promise.allSettled(sends.map((s) => s.send()));
        return sends.map((s, i) => {
            const result = results[i]!;
            if (result.status === 'fulfilled') {
                markSaved(s.key);
                return { op: s.op, ok: true };
            }
            recordFailure(space, s.op, s.key, result.reason);
            return { op: s.op, ok: false };
        });
    }

    /** Phase 1: space-scalar update + all zone add/update, in parallel. Returns failed zone-add ids. */
    async function runPhase1(spaceId: string, space: Space, plan: FlushPlan): Promise<Set<string>> {
        const sends: PendingSend[] = [];

        const scalarOp = plan.phase1.space;
        if (scalarOp) {
            sends.push({
                op: scalarOp,
                key: scalarKey(spaceId),
                send: () => api.updateFields(spaceId, scalarOp.payload!),
            });
        }
        for (const op of plan.phase1.zones) {
            sends.push({ op, key: op.id, send: () => sendZone(spaceId, op) });
        }

        const outcomes = await runSends(space, sends);

        const failedZoneAdds = new Set<string>();
        for (const { op, ok } of outcomes) {
            if (!ok && op.kind === 'zone' && op.op === 'add') failedZoneAdds.add(op.id);
        }
        return failedZoneAdds;
    }

    /** Phase 2: all item add/update/delete + all zone delete, in parallel, after phase 1 settles. */
    async function runPhase2(
        spaceId: string,
        space: Space,
        plan: FlushPlan,
        failedZoneAdds: Set<string>
    ): Promise<void> {
        const sends: PendingSend[] = [];

        for (const op of plan.phase2.items) {
            if (isTargetingFailedZone(op, failedZoneAdds)) {
                // Never sent — the zone it targets doesn't exist server-side. Roll back the
                // local optimistic state the same way a real failure would.
                applyRollback(space, op);
                markFailed(op.id, null);
                continue;
            }
            sends.push({ op, key: op.id, send: () => sendItem(spaceId, op) });
        }

        await runSends(space, sends);
    }

    /**
     * Phase 3 — zone deletes, and ONLY after every phase-2 item op has settled.
     *
     * These cannot ride along with the item ops (BUG 3, found in review). The server's
     * zone-delete cascade matches on the item's *persisted* `ZoneId`. An item moved out
     * of zone Z in this same window is still recorded under Z until its own `PUT` lands,
     * so firing `DELETE /zones/Z` concurrently means the cascade deletes the item the
     * user just moved to safety — and its `PUT` then 404s. Silent item loss, surfacing
     * only on reload.
     *
     * Nothing needs the reverse order: `stageZoneDelete` already annihilates pending
     * changes for items still inside the doomed zone, so no phase-2 op depends on a
     * zone delete having landed first.
     */
    async function runPhase3(spaceId: string, space: Space, plan: FlushPlan): Promise<void> {
        await runSends(space, plan.phase2.zoneDeletes.map((op) => ({
            op, key: op.id, send: () => api.removeZone(spaceId, op.id),
        })));
    }

    async function runFlushPlan(spaceId: string, cs: ChangeSet): Promise<void> {
        const plan = takeFlushPlan(cs);
        const space = getById(spaceId);
        if (!space) return; // space was deleted locally while edits were still pending
        const failedZoneAdds = await runPhase1(spaceId, space, plan);
        await runPhase2(spaceId, space, plan, failedZoneAdds);
        await runPhase3(spaceId, space, plan);
    }

    /**
     * Sends one space's accumulated `ChangeSet` as the two-phase batch above.
     *
     * BUG 2 fix (SC-9). The 400ms debounce only delays a flush's *start*, not its
     * *duration* — edits arriving while a flush's requests are still in flight
     * would otherwise open a second, overlapping flush for the same space, and a
     * stale rollback from the first could stomp a newer optimistic edit from the
     * second (silent data loss). Serializing per space makes that structurally
     * impossible: if a flush is already in flight for this space, re-arm the
     * debounce instead of starting a second one, and let the next window absorb
     * whatever gets staged in between. **The `finally` is load-bearing** — any path
     * that skips it (an early return, a throw) wedges this space's autosave
     * permanently, since every later flush would see `inFlight` still set and just
     * re-arm forever without ever sending.
     */
    async function flush(spaceId: string): Promise<void> {
        if (inFlight.has(spaceId)) {
            scheduleSave(spaceId);
            return;
        }
        const cs = changeSets.get(spaceId);
        if (!cs || isEmpty(cs)) return;
        inFlight.add(spaceId);
        try {
            await runFlushPlan(spaceId, cs);
        } finally {
            inFlight.delete(spaceId);
        }
    }

    /** Debounced per-space flush trigger — batches rapid edits into one flush per space. */
    function scheduleSave(spaceId: string): void {
        const pending = saveTimers.get(spaceId);
        if (pending) clearTimeout(pending);
        saveTimers.set(
            spaceId,
            setTimeout(() => {
                saveTimers.delete(spaceId);
                // A rejected *send* never reaches here (runSends uses Promise.allSettled),
                // so this only fires for an unexpected bug inside the flush itself. Log it
                // rather than let it become a context-free unhandled rejection; `flush`'s
                // own `finally` has already released the in-flight guard, so the next
                // window still saves.
                flush(spaceId).catch((e) => console.error('[spaces] flush failed', e));
            }, 400)
        );
    }

    function createRemote(space: Space): void {
        void api.create(space).catch((e) => handleCreateError(space, e));
    }
    function deleteRemote(id: string): void {
        const pending = saveTimers.get(id);
        if (pending) clearTimeout(pending);
        saveTimers.delete(id);
        changeSets.delete(id); // staged edits for a deleted space must never flush
        void api.remove(id).catch(handleDeleteError);
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
        changeSets.clear();
        inFlight.clear();
        saveState.value.clear();
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
            const trimmed = name.trim() || space.name;
            stageUpdate(getOrCreateChangeSet(id), 'space', space, { name: trimmed });
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
        stageAdd(getOrCreateChangeSet(spaceId), 'item', item);
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
        stageAdd(getOrCreateChangeSet(spaceId), 'item', item);
        scheduleSave(spaceId);
        return item;
    }

    function removeItem(spaceId: string, itemId: string): void {
        const space = getById(spaceId);
        const item = space?.items.find((it) => it.id === itemId);
        if (space && item) {
            space.items = space.items.filter((it) => it.id !== itemId);
            stageDelete(getOrCreateChangeSet(spaceId), 'item', item);
            scheduleSave(spaceId);
        }
    }

    function updateItem(spaceId: string, itemId: string, patch: Partial<Item>): void {
        const space = getById(spaceId);
        const item = space?.items.find((it) => it.id === itemId);
        if (item) {
            stageUpdate(getOrCreateChangeSet(spaceId), 'item', item, patch);
            scheduleSave(spaceId);
        }
    }

    function setViewMode(spaceId: string, mode: ViewMode): void {
        const space = getById(spaceId);
        if (space) {
            stageUpdate(getOrCreateChangeSet(spaceId), 'space', space, { viewMode: mode });
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
        stageAdd(getOrCreateChangeSet(spaceId), 'zone', zone);
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
        stageAdd(getOrCreateChangeSet(spaceId), 'zone', zone);
        scheduleSave(spaceId);
        return zone;
    }

    function updateZone(spaceId: string, zoneId: string, patch: Partial<Zone>): void {
        const space = getById(spaceId);
        const zone = space?.zones.find((z) => z.id === zoneId);
        if (zone) {
            stageUpdate(getOrCreateChangeSet(spaceId), 'zone', zone, patch);
            scheduleSave(spaceId);
        }
    }

    /** Delete a zone and any items inside it. */
    function deleteZone(spaceId: string, zoneId: string): void {
        const space = getById(spaceId);
        if (!space) return;
        const zone = space.zones.find((z) => z.id === zoneId);
        if (!zone) return;
        const itemsInZone = space.items.filter((it) => it.zoneId === zoneId);
        space.zones = space.zones.filter((z) => z.id !== zoneId);
        space.items = space.items.filter((it) => it.zoneId !== zoneId);
        stageZoneDelete(getOrCreateChangeSet(spaceId), zone, itemsInZone);
        scheduleSave(spaceId);
    }

    /** Switch a columns-mode space to the free canvas, flowing existing zones into place. */
    function convertToFreeform(spaceId: string): void {
        const space = getById(spaceId);
        if (!space) return;
        const cs = getOrCreateChangeSet(spaceId);
        stageUpdate(cs, 'space', space, {
            canvasMode: 'freeform',
            layoutColumns: 1,
            columnLabels: null,
        });
        // Escape hatch: snapshot every zone before `flowFreeform` mutates their rects
        // in place, so a rejected flush can still restore each zone's prior rect.
        for (const zone of space.zones) {
            snapshotForUpdate(cs, 'zone', zone);
        }
        flowFreeform(space.zones);
        scheduleSave(spaceId);
    }

    return {
        spaces,
        currentId,
        count,
        currentSpace,
        hydrated,
        saveState,
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
