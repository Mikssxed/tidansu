import {
    applyRollback,
    createChangeSet,
    isEmpty,
    stageAdd,
    stageDelete,
    stageUpdate,
    stageZoneDelete,
    takeFlushPlan,
    type FlushOperation,
} from '@/data/pendingChanges';
import type { Item, Space, Zone } from '@/data/types';
import { describe, expect, it } from 'vitest';

function makeItem(overrides: Partial<Item> = {}): Item {
    return {
        id: 'item-1',
        name: 'Milk',
        zoneId: 'zone-1',
        quantity: 1,
        tags: [],
        dateAdded: '2024-01-01T00:00:00.000Z',
        expiry: null,
        photo: null,
        slotIndex: 0,
        depth: 'front',
        level: 1,
        ...overrides,
    };
}

function makeZone(overrides: Partial<Zone> = {}): Zone {
    return {
        id: 'zone-1',
        position: 1,
        label: null,
        color: 'blue',
        gridCols: 4,
        gridRows: 1,
        hasDepth: false,
        floor: false,
        kind: 'shelf',
        facing: 'front',
        levels: 1,
        column: 0,
        rect: null,
        ...overrides,
    };
}

function makeSpace(overrides: Partial<Space> = {}): Space {
    return {
        id: 'space-1',
        name: 'Fridge',
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
        ...overrides,
    };
}

describe('pendingChanges coalescing table', () => {
    it('records a fresh add with a null snapshot', () => {
        const cs = createChangeSet();
        const item = makeItem();

        stageAdd(cs, 'item', item);
        const plan = takeFlushPlan(cs);

        expect(plan.phase2.items).toHaveLength(1);
        expect(plan.phase2.items[0]).toMatchObject({ op: 'add', id: item.id, snapshot: null });
        expect(plan.phase2.items[0]!.payload).toEqual(item);
    });

    it('records a fresh update with the pre-mutation snapshot and mutates the live entity', () => {
        const cs = createChangeSet();
        const item = makeItem({ name: 'Milk' });

        stageUpdate(cs, 'item', item, { name: 'Oat milk' });
        expect(item.name).toBe('Oat milk');

        const plan = takeFlushPlan(cs);
        const op = plan.phase2.items[0]!;
        expect(op.op).toBe('update');
        expect(op.snapshot).toMatchObject({ name: 'Milk' });
        expect(op.payload).toMatchObject({ name: 'Oat milk' });
    });

    it('records a fresh delete with a snapshot for restore and no payload', () => {
        const cs = createChangeSet();
        const zone = makeZone();

        stageDelete(cs, 'zone', zone);
        const plan = takeFlushPlan(cs);

        const op = plan.phase2.zoneDeletes[0]!;
        expect(op.op).toBe('delete');
        expect(op.payload).toBeUndefined();
        expect(op.snapshot).toMatchObject({ id: zone.id });
    });

    it('add followed by update stays an add and sends the current state', () => {
        const cs = createChangeSet();
        const item = makeItem();

        stageAdd(cs, 'item', item);
        stageUpdate(cs, 'item', item, { quantity: 5 });

        const plan = takeFlushPlan(cs);
        expect(plan.phase2.items).toHaveLength(1);
        expect(plan.phase2.items[0]!.op).toBe('add');
        expect(plan.phase2.items[0]!.payload).toMatchObject({ quantity: 5 });
    });

    it('add followed by delete sends nothing at all', () => {
        const cs = createChangeSet();
        const item = makeItem();

        stageAdd(cs, 'item', item);
        stageDelete(cs, 'item', item);

        expect(isEmpty(cs)).toBe(true);
        const plan = takeFlushPlan(cs);
        expect(plan.phase2.items).toHaveLength(0);
    });

    it('update followed by update stays an update and keeps the EARLIEST snapshot', () => {
        const cs = createChangeSet();
        const item = makeItem({ name: 'Milk' });

        stageUpdate(cs, 'item', item, { name: 'Oat milk' });
        stageUpdate(cs, 'item', item, { name: 'Almond milk' });

        const plan = takeFlushPlan(cs);
        const op = plan.phase2.items[0]!;
        expect(op.op).toBe('update');
        expect(op.snapshot).toMatchObject({ name: 'Milk' }); // not the mid-edit 'Oat milk'
        expect(op.payload).toMatchObject({ name: 'Almond milk' });
    });

    it('update followed by delete becomes a delete that restores the pre-window state', () => {
        const cs = createChangeSet();
        const zone = makeZone({ label: 'Top shelf' });

        stageUpdate(cs, 'zone', zone, { label: 'Middle shelf' });
        stageDelete(cs, 'zone', zone);

        const plan = takeFlushPlan(cs);
        const op = plan.phase2.zoneDeletes[0]!;
        expect(op.op).toBe('delete');
        expect(op.snapshot).toMatchObject({ label: 'Top shelf' });
    });
});

describe('stageZoneDelete', () => {
    it('drops pending item changes in that zone and carries cascaded items for restore', () => {
        const cs = createChangeSet();
        const zone = makeZone({ id: 'zone-1' });
        const keptItem = makeItem({ id: 'item-keep', zoneId: 'zone-2' });
        const pendingAdd = makeItem({ id: 'item-add', zoneId: 'zone-1' });
        const pendingUpdate = makeItem({ id: 'item-update', zoneId: 'zone-1', name: 'Butter' });

        stageAdd(cs, 'item', pendingAdd);
        stageUpdate(cs, 'item', pendingUpdate, { name: 'Salted butter' });
        stageUpdate(cs, 'item', keptItem, { quantity: 2 });

        stageZoneDelete(cs, zone, [pendingAdd, pendingUpdate]);

        const plan = takeFlushPlan(cs);
        expect(plan.phase2.items.map((op) => op.id)).toEqual(['item-keep']);
        expect(plan.phase2.zoneDeletes).toHaveLength(1);

        const zoneOp = plan.phase2.zoneDeletes[0]!;
        expect(zoneOp.op).toBe('delete');
        expect(zoneOp.cascaded).toHaveLength(2);
        expect(zoneOp.cascaded!.map((it) => it.id).sort()).toEqual(['item-add', 'item-update']);
    });

    it('an add+zone-delete on a same-window zone annihilates too (never existed server-side)', () => {
        const cs = createChangeSet();
        const zone = makeZone({ id: 'zone-1' });
        const pendingAdd = makeItem({ id: 'item-add', zoneId: 'zone-1' });

        stageAdd(cs, 'zone', zone);
        stageAdd(cs, 'item', pendingAdd);
        stageZoneDelete(cs, zone, [pendingAdd]);

        expect(isEmpty(cs)).toBe(true);
    });
});

describe('takeFlushPlan', () => {
    it('splits space-scalars and zone add/update into phase1, item ops and zone deletes into phase2', () => {
        const cs = createChangeSet();
        const space = makeSpace();
        const addedZone = makeZone({ id: 'zone-new' });
        const updatedZone = makeZone({ id: 'zone-existing' });
        const deletedZone = makeZone({ id: 'zone-gone' });
        const addedItem = makeItem({ id: 'item-new' });
        const updatedItem = makeItem({ id: 'item-existing' });

        stageUpdate(cs, 'space', space, { name: 'New name' });
        stageAdd(cs, 'zone', addedZone);
        stageUpdate(cs, 'zone', updatedZone, { label: 'Renamed' });
        stageDelete(cs, 'zone', deletedZone);
        stageAdd(cs, 'item', addedItem);
        stageUpdate(cs, 'item', updatedItem, { quantity: 3 });

        const plan = takeFlushPlan(cs);

        expect(plan.phase1.space?.id).toBe(space.id);
        expect(plan.phase1.zones.map((op) => op.id).sort()).toEqual(['zone-existing', 'zone-new']);
        expect(plan.phase2.items.map((op) => op.id).sort()).toEqual(['item-existing', 'item-new']);
        expect(plan.phase2.zoneDeletes.map((op) => op.id)).toEqual(['zone-gone']);
    });

    it('leaves a fresh empty ChangeSet behind for the next window', () => {
        const cs = createChangeSet();
        stageAdd(cs, 'item', makeItem());

        expect(isEmpty(cs)).toBe(false);
        takeFlushPlan(cs);
        expect(isEmpty(cs)).toBe(true);

        // The same ChangeSet reference keeps working for the next window.
        stageAdd(cs, 'item', makeItem({ id: 'item-2' }));
        expect(isEmpty(cs)).toBe(false);
    });
});

describe('applyRollback', () => {
    it('removes an added item', () => {
        const item = makeItem({ id: 'item-1' });
        const space = makeSpace({ items: [item] });
        const op: FlushOperation<Item> = { kind: 'item', id: 'item-1', op: 'add', payload: item, snapshot: null };

        applyRollback(space, op);

        expect(space.items).toHaveLength(0);
    });

    it('restores the snapshot for a failed item update', () => {
        const item = makeItem({ id: 'item-1', name: 'Oat milk' });
        const space = makeSpace({ items: [item] });
        const snapshot = makeItem({ id: 'item-1', name: 'Milk' });
        const op: FlushOperation<Item> = { kind: 'item', id: 'item-1', op: 'update', payload: item, snapshot };

        applyRollback(space, op);

        expect(space.items[0]!.name).toBe('Milk');
    });

    it('re-inserts a deleted item from its snapshot', () => {
        const space = makeSpace({ items: [] });
        const snapshot = makeItem({ id: 'item-1' });
        const op: FlushOperation<Item> = {
            kind: 'item',
            id: 'item-1',
            op: 'delete',
            payload: undefined,
            snapshot,
        };

        applyRollback(space, op);

        expect(space.items.map((it) => it.id)).toEqual(['item-1']);
    });

    it('re-inserts a deleted zone and its cascaded items', () => {
        const space = makeSpace({ zones: [], items: [] });
        const zoneSnapshot = makeZone({ id: 'zone-1' });
        const cascadedItems = [
            makeItem({ id: 'item-1', zoneId: 'zone-1' }),
            makeItem({ id: 'item-2', zoneId: 'zone-1' }),
        ];
        const op: FlushOperation<Zone> = {
            kind: 'zone',
            id: 'zone-1',
            op: 'delete',
            payload: undefined,
            snapshot: zoneSnapshot,
            cascaded: cascadedItems,
        };

        applyRollback(space, op);

        expect(space.zones.map((z) => z.id)).toEqual(['zone-1']);
        expect(space.items.map((it) => it.id).sort()).toEqual(['item-1', 'item-2']);
    });

    it('removes an added zone', () => {
        const zone = makeZone({ id: 'zone-1' });
        const space = makeSpace({ zones: [zone] });
        const op: FlushOperation<Zone> = { kind: 'zone', id: 'zone-1', op: 'add', payload: zone, snapshot: null };

        applyRollback(space, op);

        expect(space.zones).toHaveLength(0);
    });

    it('restores the snapshot for a failed space-scalar update', () => {
        const space = makeSpace({ name: 'Renamed fridge' });
        const snapshot = makeSpace({ name: 'Fridge' });
        const op: FlushOperation<Space> = {
            kind: 'space',
            id: space.id,
            op: 'update',
            payload: space,
            snapshot,
        };

        applyRollback(space, op);

        expect(space.name).toBe('Fridge');
    });

    /**
     * Regression — review finding M1. A space-scalar rollback must restore ONLY the
     * scalars it sent. The snapshot is a clone of the whole `Space`, so a blanket
     * `Object.assign(space, snapshot)` also reinstates the `zones`/`items` arrays as
     * they were when the rename was staged — silently dropping a sibling item that was
     * added in the same window and already persisted server-side. That directly
     * violates FR-11 ("a rejected mutation rolls back ONLY itself").
     *
     * The original test above hides this: it builds both space and snapshot from
     * `makeSpace()`, whose zones/items are empty, so restoring the stale arrays is
     * invisible. This one gives them real contents.
     */
    it('M1: a failed space rename must NOT revert a sibling item added in the same window', () => {
        const existing = makeItem({ id: 'item-existing' });
        const space = makeSpace({ name: 'Fridge', items: [existing] });

        // The rename is staged first — the snapshot captures items as [existing].
        const cs = createChangeSet();
        stageUpdate(cs, 'space', space, { name: 'Renamed fridge' });

        // ...then a sibling item is added in the SAME window and succeeds server-side.
        const added = makeItem({ id: 'item-added' });
        space.items.push(added);
        stageAdd(cs, 'item', added);

        const plan = takeFlushPlan(cs);
        applyRollback(space, plan.phase1.space!);   // only the rename failed

        expect(space.name).toBe('Fridge');                                  // scalar reverted
        expect(space.items.map((i) => i.id)).toContain('item-added');       // sibling survives
        expect(space.items).toHaveLength(2);
    });
});
