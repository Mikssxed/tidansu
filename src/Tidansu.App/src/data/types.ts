/*
 * Typed port of the prototype's data model (design_files/data.jsx). The store is
 * split per Pinia conventions; these are the plain data shapes shared across it.
 */

export type Plan = 'free' | 'pro';

export type SpaceTypeId = 'fridge' | 'freezer' | 'cellar' | 'cabinet' | 'list' | 'other';

export type ZoneColor = 'blue' | 'green' | 'amber' | 'pink' | 'gray';

export type ZoneFacing = 'front' | 'left' | 'right' | 'back';
export type ZoneKind = 'shelf' | 'floor' | 'drawer';
export type ItemDepth = 'front' | 'back';

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface Zone {
    id: string;
    position: number;
    label: string | null;
    color: ZoneColor;
    gridCols: number;
    gridRows: number;
    hasDepth: boolean;
    floor: boolean;
    kind: ZoneKind;
    facing: ZoneFacing;
    /** vertical tiers inside this unit; level 1 = top */
    levels: number;
    column: number;
    /** {x,y,w,h} on the free canvas, or null until laid out */
    rect: Rect | null;
}

export interface Item {
    id: string;
    name: string;
    zoneId: string;
    quantity: number;
    tags: string[];
    dateAdded: string;
    expiry: string | null;
    photo: string | null;
    slotIndex: number | null;
    depth: ItemDepth;
    level: number;
}

export type CanvasMode = 'columns' | 'freeform';
export type ViewMode = 'list' | 'layout';

export interface Space {
    id: string;
    name: string;
    type: SpaceTypeId;
    viewMode: ViewMode;
    canvasMode: CanvasMode;
    layoutColumns: number;
    columnLabels: string[] | null;
    zones: Zone[];
    items: Item[];
}
