/*
 * Pure module owning the store's pending-edit coalescing rules (B-15 / T-24). No Vue,
 * no network, no transport DTOs — a `ChangeSet` is a plain opaque value and every
 * function here is a pure(-ish, entity-mutating) function over it. See
 * docs/active/tasks/B-15-granular-space-endpoints/tech-tasks.md T-24 for the full
 * design rationale (chosen via a 4-way `design-an-interface` exploration).
 *
 * Two structural properties are the entire point of this design — do not undo them:
 *  1. `stageUpdate`/`snapshotForUpdate` capture the pre-mutation snapshot themselves,
 *     on first touch within a debounce window. A call site can never forget to
 *     snapshot before mutating.
 *  2. Every `FlushOperation` produced by `takeFlushPlan` is self-contained — it
 *     carries its own `payload`, `snapshot` and `cascaded`. `applyRollback` never
 *     needs a second lookup into a `ChangeSet`, which `takeFlushPlan` has by then
 *     already cleared.
 */

import type { Item, Space, Zone } from '@/data/types';

export type EntityKind = 'space' | 'zone' | 'item';
export type PendingOp = 'add' | 'update' | 'delete';

// Opaque to callers by construction: the interface has no members, and the real
// state lives in `registry` below, keyed by object identity. A `ChangeSet` can only
// be produced by `createChangeSet` and can only be read/mutated via this module's
// exported functions.
export interface ChangeSet {}

export interface FlushOperation<T> {
    readonly kind: EntityKind;
    readonly id: string;
    readonly op: PendingOp;
    readonly payload: T | undefined; // undefined for 'delete'
    readonly snapshot: T | null; // null for 'add'
    readonly cascaded?: Item[]; // zone 'delete' only
}

export interface FlushPlan {
    readonly phase1: { space: FlushOperation<Space> | null; zones: FlushOperation<Zone>[] };
    readonly phase2: { items: FlushOperation<Item>[]; zoneDeletes: FlushOperation<Zone>[] };
}

interface PendingEntry<T = unknown> {
    readonly kind: EntityKind;
    readonly id: string;
    readonly op: PendingOp;
    readonly entity: T;
    readonly snapshot: T | null;
    readonly cascaded?: Item[];
}

const registry = new WeakMap<ChangeSet, Map<string, PendingEntry>>();

function entriesOf(set: ChangeSet): Map<string, PendingEntry> {
    const entries = registry.get(set);
    if (!entries) throw new Error('pendingChanges: not a ChangeSet created by createChangeSet()');
    return entries;
}

function entryKey(kind: EntityKind, id: string): string {
    return `${kind}:${id}`;
}

/**
 * One-level-deep clone. A plain `{ ...entity }` would alias nested mutable fields
 * (Zone.rect, Item.tags, Space.columnLabels) with the live entity, so a later
 * in-place edit to the live object could silently corrupt an already-captured
 * snapshot. Strings (e.g. Item.photo) are immutable, so the top-level spread
 * already isolates those safely — no need to go deeper than one level.
 */
function cloneEntity<T>(entity: T): T {
    const clone = { ...entity } as Record<string, unknown>;
    for (const key of Object.keys(clone)) {
        const value = clone[key];
        if (Array.isArray(value)) {
            clone[key] = [...value];
        } else if (value !== null && typeof value === 'object') {
            clone[key] = { ...(value as Record<string, unknown>) };
        }
    }
    return clone as T;
}

export function createChangeSet(): ChangeSet {
    const set: ChangeSet = {};
    registry.set(set, new Map());
    return set;
}

export function isEmpty(set: ChangeSet): boolean {
    return entriesOf(set).size === 0;
}

/** Record first touch this window; a later touch leaves the existing op/snapshot alone. */
function touch<T extends { id: string }>(set: ChangeSet, kind: EntityKind, entity: T): void {
    const map = entriesOf(set);
    const key = entryKey(kind, entity.id);
    if (!map.has(key)) {
        map.set(key, { kind, id: entity.id, op: 'update', entity, snapshot: cloneEntity(entity) });
    }
}

/**
 * THE COMMON CASE — a one-for-one swap for `Object.assign(entity, patch)`. Captures
 * the pre-mutation snapshot on first touch this window (coalescing repeats keeps the
 * earliest snapshot), then applies the patch to the live entity for optimistic UI.
 */
export function stageUpdate<T extends { id: string }>(
    set: ChangeSet,
    kind: EntityKind,
    entity: T,
    patch: Partial<T>
): void {
    touch(set, kind, entity);
    Object.assign(entity, patch);
}

/**
 * Escape hatch for updates that are not a flat patch (e.g. `convertToFreeform`'s
 * `flowFreeform` fan-out over every zone): snapshot first, then the caller mutates.
 */
export function snapshotForUpdate<T extends { id: string }>(set: ChangeSet, kind: EntityKind, entity: T): void {
    touch(set, kind, entity);
}

export function stageAdd<T extends { id: string }>(set: ChangeSet, kind: EntityKind, entity: T): void {
    entriesOf(set).set(entryKey(kind, entity.id), { kind, id: entity.id, op: 'add', entity, snapshot: null });
}

function stageDeleteEntry<T extends { id: string }>(
    set: ChangeSet,
    kind: EntityKind,
    entity: T,
    cascaded?: Item[]
): void {
    const map = entriesOf(set);
    const key = entryKey(kind, entity.id);
    const existing = map.get(key);
    if (existing?.op === 'add') {
        // The entity never existed server-side — add+delete annihilates.
        map.delete(key);
        return;
    }
    // Keep the earliest (last server-known) snapshot so a failed delete restores the
    // server value, not a mid-edit one.
    const snapshot = existing ? existing.snapshot : cloneEntity(entity);
    map.set(key, { kind, id: entity.id, op: 'delete', entity, snapshot: snapshot as T | null, cascaded });
}

export function stageDelete<T extends { id: string }>(set: ChangeSet, kind: EntityKind, entity: T): void {
    stageDeleteEntry(set, kind, entity);
}

/**
 * Drops every pending change for items in this zone — the server cascade (FR-3)
 * handles items that already exist server-side, and a pending item-add in a deleted
 * zone must never be sent. Carries `cascaded` so a failed zone delete restores the
 * zone and its items together. Absorbs what an earlier draft called
 * `dropZoneChildren`; that is intentionally not a separate export.
 */
export function stageZoneDelete(set: ChangeSet, zone: Zone, itemsInZone: Item[]): void {
    const map = entriesOf(set);
    for (const item of itemsInZone) {
        map.delete(entryKey('item', item.id));
    }
    stageDeleteEntry(set, 'zone', zone, itemsInZone.map(cloneEntity));
}

function toFlushOperation<T>(entry: PendingEntry<T>): FlushOperation<T> {
    const base: FlushOperation<T> = {
        kind: entry.kind,
        id: entry.id,
        op: entry.op,
        payload: entry.op === 'delete' ? undefined : cloneEntity(entry.entity),
        snapshot: entry.snapshot,
    };
    return entry.cascaded ? { ...base, cascaded: entry.cascaded } : base;
}

/** Takes the window and installs a fresh empty ChangeSet for the next one. */
export function takeFlushPlan(set: ChangeSet): FlushPlan {
    const map = entriesOf(set);
    const entries = [...map.values()];
    map.clear();

    let space: FlushOperation<Space> | null = null;
    const zones: FlushOperation<Zone>[] = [];
    const items: FlushOperation<Item>[] = [];
    const zoneDeletes: FlushOperation<Zone>[] = [];

    for (const entry of entries) {
        if (entry.kind === 'space') {
            space = toFlushOperation(entry as PendingEntry<Space>);
        } else if (entry.kind === 'zone') {
            const op = toFlushOperation(entry as PendingEntry<Zone>);
            if (entry.op === 'delete') zoneDeletes.push(op);
            else zones.push(op);
        } else {
            items.push(toFlushOperation(entry as PendingEntry<Item>));
        }
    }

    return {
        phase1: { space, zones },
        phase2: { items, zoneDeletes },
    };
}

/**
 * The scalar fields a space-kind op actually sends (the `PUT /api/spaces/{id}/fields`
 * body). Rollback restores exactly these and nothing else — see `rollbackSpace`.
 */
const SPACE_SCALAR_KEYS = [
    'name', 'type', 'viewMode', 'canvasMode', 'layoutColumns', 'columnLabels',
] as const satisfies readonly (keyof Space)[];

function rollbackSpace(space: Space, op: FlushOperation<Space>): void {
    // 'add'/'delete' aren't reachable here — space create/delete stay whole-space
    // POST/DELETE (T-25), never routed through this per-entity path.
    if (op.op !== 'update' || !op.snapshot) return;

    // Restore ONLY the scalars (review finding M1). A blanket
    // `Object.assign(space, op.snapshot)` would also reinstate `zones`/`items` from the
    // snapshot's arrays, which were cloned when the rename was *staged* — silently
    // dropping a sibling zone/item added later in the same window and already persisted
    // server-side. FR-11 requires a rejected mutation to roll back only itself, and a
    // space-scalar op only ever sent the scalars.
    for (const key of SPACE_SCALAR_KEYS) {
        (space[key] as Space[typeof key]) = op.snapshot[key];
    }
}

function rollbackZone(space: Space, op: FlushOperation<Zone>): void {
    switch (op.op) {
        case 'add':
            space.zones = space.zones.filter((z) => z.id !== op.id);
            return;
        case 'update': {
            const zone = space.zones.find((z) => z.id === op.id);
            if (zone && op.snapshot) Object.assign(zone, op.snapshot);
            return;
        }
        case 'delete':
            if (op.snapshot) space.zones.push(op.snapshot);
            if (op.cascaded) space.items.push(...op.cascaded);
            return;
    }
}

function rollbackItem(space: Space, op: FlushOperation<Item>): void {
    switch (op.op) {
        case 'add':
            space.items = space.items.filter((it) => it.id !== op.id);
            return;
        case 'update': {
            const item = space.items.find((it) => it.id === op.id);
            if (item && op.snapshot) Object.assign(item, op.snapshot);
            return;
        }
        case 'delete':
            if (op.snapshot) space.items.push(op.snapshot);
            return;
    }
}

/** One call regardless of add/update/delete/cascade shape. */
export function applyRollback(space: Space, op: FlushOperation<Space | Zone | Item>): void {
    switch (op.kind) {
        case 'space':
            rollbackSpace(space, op as FlushOperation<Space>);
            return;
        case 'zone':
            rollbackZone(space, op as FlushOperation<Zone>);
            return;
        case 'item':
            rollbackItem(space, op as FlushOperation<Item>);
            return;
    }
}
