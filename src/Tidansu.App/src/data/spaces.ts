import type { IconName } from '@/components/icons';
import type { CanvasMode, Item, Rect, Space, SpaceTypeId, Zone, ZoneColor, ZoneKind } from '@/data/types';

export const ZONE_COLORS: ZoneColor[] = ['blue', 'green', 'amber', 'pink', 'gray'];

export interface SpaceTypeDef {
    id: SpaceTypeId;
    icon: IconName;
    title: string;
    desc: string;
    noun: string;
}

/** Space type catalogue (onboarding screen 1) — ported from SPACE_TYPES. */
export const SPACE_TYPES: SpaceTypeDef[] = [
    { id: 'fridge', icon: 'fridge', title: 'Fridge', desc: 'Shelves top to bottom, plus a door.', noun: 'Shelf' },
    { id: 'freezer', icon: 'snow', title: 'Freezer', desc: 'Stacked drawers or baskets.', noun: 'Drawer' },
    { id: 'cellar', icon: 'wine', title: 'Cellar', desc: 'Racks and bins for bottles & jars.', noun: 'Rack' },
    { id: 'cabinet', icon: 'cabinet', title: 'Cabinet', desc: 'Shelves with front/back depth.', noun: 'Shelf' },
    { id: 'list', icon: 'dots', title: 'Just a list', desc: 'No layout — one simple list.', noun: 'Group' },
    { id: 'other', icon: 'spark2', title: 'Something else', desc: 'Start blank, shape it later.', noun: 'Zone' },
];

export const spaceTypeDef = (id: SpaceTypeId): SpaceTypeDef =>
    SPACE_TYPES.find((t) => t.id === id) ?? SPACE_TYPES[5]!; // fallback: "other"

type ZoneTemplate = Partial<{ label: string; hasDepth: boolean; floor: boolean }>;

/** Auto-generated zone templates per type. label omitted -> "{noun} {position}". */
export const ZONE_TEMPLATES: Record<SpaceTypeId, ZoneTemplate[]> = {
    fridge: [{}, {}, {}, { label: 'Door' }, { label: 'Vegetable drawer' }],
    freezer: [{}, {}, {}],
    cellar: [{}, {}, {}, { label: 'Bottom bin' }],
    cabinet: [{ hasDepth: true }, { hasDepth: true }, { label: 'Floor', floor: true }],
    list: [{ label: 'All items' }],
    other: [{}, {}],
};

let _id = 0;
export const uid = (p = 'id'): string =>
    `${p}_${(++_id).toString(36)}${Date.now().toString(36).slice(-3)}`;

export function buildZones(type: SpaceTypeId): Zone[] {
    const tmpl = ZONE_TEMPLATES[type] ?? ZONE_TEMPLATES.other;
    return tmpl.map((z, i) => ({
        id: uid('zone'),
        position: i + 1,
        label: z.label ?? null,
        color: ZONE_COLORS[i % ZONE_COLORS.length]!,
        gridCols: z.floor ? 0 : 4,
        gridRows: 1,
        hasDepth: !!z.hasDepth,
        floor: !!z.floor,
        kind: z.floor ? 'floor' : 'shelf',
        facing: 'front',
        levels: 1,
        column: 0,
        rect: null,
    }));
}

/** Create a single zone (used by the layout editor — add shelf / draw zone). */
export function makeZone(opts: {
    position: number;
    colorIndex: number;
    kind?: ZoneKind;
    floor?: boolean;
    column?: number;
    rect?: Rect | null;
}): Zone {
    const floor = opts.floor ?? opts.kind === 'floor';
    return {
        id: uid('zone'),
        position: opts.position,
        label: null,
        color: ZONE_COLORS[opts.colorIndex % ZONE_COLORS.length]!,
        gridCols: floor ? 0 : 4,
        gridRows: 1,
        hasDepth: false,
        floor,
        kind: floor ? 'floor' : (opts.kind ?? 'shelf'),
        facing: 'front',
        levels: 1,
        column: opts.column ?? 0,
        rect: opts.rect ?? null,
    };
}

/**
 * Derive the dashboard-summary fields (B-16) from a live zone/item graph — used
 * wherever a `Space` is built or edited client-side (seeding, duplication, local
 * mutations), mirroring what the server's `SpaceSummaryDto` projects.
 */
export function summarize(
    zones: Zone[],
    items: Item[]
): Pick<Space, 'itemCount' | 'zoneCount' | 'previewColors'> {
    return {
        itemCount: items.length,
        zoneCount: zones.length,
        previewColors: [...zones]
            .sort((a, b) => a.position - b.position)
            .slice(0, 6)
            .map((z) => z.color),
    };
}

export const FACINGS: [string, string][] = [
    ['front', 'Front'],
    ['left', 'Left'],
    ['right', 'Right'],
    ['back', 'Back'],
];
/** spatial reading order for the Shelves view: left · front · right · back */
export const WALL_ORDER = ['left', 'front', 'right', 'back'] as const;

const SPACE_NOUN: Record<SpaceTypeId, string> = Object.fromEntries(
    SPACE_TYPES.map((s) => [s.id, s.noun])
) as Record<SpaceTypeId, string>;

export function zoneName(zone: Zone, type: SpaceTypeId = 'fridge'): string {
    if (zone.label) return zone.label;
    const noun =
        zone.kind === 'drawer' ? 'Drawer' : zone.kind === 'floor' ? 'Floor' : SPACE_NOUN[type] ?? 'Shelf';
    return `${noun} ${zone.position}`;
}

// ---- layout geometry ----
export const GRID_UNIT = 24;
export const snapGrid = (v: number): number => Math.round(v / GRID_UNIT) * GRID_UNIT;

export function zoneFootprint(z: Zone): { w: number; h: number } {
    if (z.floor) return { w: 312, h: 120 };
    const h = 52 + Math.max(1, z.gridRows || 1) * 64 + (z.hasDepth ? 30 : 0);
    return { w: 312, h: snapGrid(h) };
}

/** flow zones into two columns on the free canvas (shortest-column packing) */
export function flowFreeform(zones: Zone[]): Zone[] {
    const x: [number, number] = [24, 360];
    const colY: [number, number] = [24, 24];
    zones.forEach((z) => {
        const c: 0 | 1 = colY[0] <= colY[1] ? 0 : 1;
        const fp = zoneFootprint(z);
        z.rect = { x: x[c], y: colY[c], w: fp.w, h: fp.h };
        z.column = c;
        colY[c] += fp.h + 24;
    });
    return zones;
}

/** split zones into n contiguous columns */
export function assignColumns(zones: Zone[], n: number): Zone[] {
    const per = Math.ceil(zones.length / n);
    zones.forEach((z, i) => {
        z.column = Math.min(n - 1, Math.floor(i / per));
    });
    return zones;
}

export type Complexity = 'simple' | 'twodoors' | 'draw';

/** apply the onboarding complexity choice to a space */
export function applyComplexity(space: Space, complexity: Complexity): Space {
    if (complexity === 'twodoors') {
        space.canvasMode = 'columns';
        space.layoutColumns = 2;
        space.columnLabels = ['Left', 'Right'];
        assignColumns(space.zones, 2);
    } else if (complexity === 'draw') {
        space.canvasMode = 'freeform';
        space.layoutColumns = 1;
        space.columnLabels = null;
        flowFreeform(space.zones);
    } else {
        space.canvasMode = 'columns' as CanvasMode;
        space.layoutColumns = 1;
        space.columnLabels = null;
        space.zones.forEach((z) => {
            z.column = 0;
        });
    }
    return space;
}
