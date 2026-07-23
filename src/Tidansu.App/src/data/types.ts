/*
 * Typed port of the prototype's data model (design_files/data.jsx). The store is
 * split per Pinia conventions; these are the plain data shapes shared across it.
 */

import type { IconName } from '@/components/icons';

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
    /** Optional icon override; falls back to itemIcon(name) when unset. */
    icon?: IconName | null;
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
    /** Full zone/item graph — empty until the space is opened (lazy-loaded, B-16). */
    zones: Zone[];
    items: Item[];
    /** Dashboard-summary counts; carried by the list read and kept in sync locally. */
    itemCount: number;
    zoneCount: number;
    /** First (up to) 6 zone colours, ordered by position — dashboard preview bands. */
    previewColors: ZoneColor[];
    /**
     * Server-authoritative "this space is one of the account's excess spaces and is
     * read-only" truth (B-25) — carried by the summaries list and never derived
     * client-side (position/id order). Optional: locally built spaces (onboarding,
     * duplicate, the starter seed) legitimately omit it; absent means not over-cap.
     */
    overCap?: boolean;
}
