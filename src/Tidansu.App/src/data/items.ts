import { zoneName } from '@/data/spaces';
import type { ItemDepth, Item, Space, SpaceTypeId, Zone } from '@/data/types';

/** Items in a zone, optionally filtered by depth band / level, sorted by slot index. */
export function itemsOf(
    space: Space,
    zoneId: string,
    depth: ItemDepth | null = null,
    level: number | null = null
): Item[] {
    return space.items
        .filter(
            (it) =>
                it.zoneId === zoneId &&
                (depth ? (it.depth || 'front') === depth : true) &&
                (level ? (it.level || 1) === level : true)
        )
        .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
}

export interface ParsedAdd {
    name: string;
    zoneHint: string | null;
    quantity: number;
}

/** parse "milk, top shelf x2" -> { name, zoneHint, quantity } (ported from parseAdd). */
export function parseAdd(raw: string): ParsedAdd {
    let s = raw.trim();
    let quantity = 1;
    const qm = s.match(/\s*[x×]\s*(\d{1,3})\s*$/i) || s.match(/\s+(\d{1,3})\s*$/);
    if (qm && qm.index !== undefined) {
        quantity = parseInt(qm[1]!, 10);
        s = s.slice(0, qm.index).trim();
    }
    let zoneHint: string | null = null;
    const parts = s.split(',');
    if (parts.length > 1) {
        zoneHint = parts.slice(1).join(',').trim();
        s = parts[0]!.trim();
    }
    const name = s.charAt(0).toUpperCase() + s.slice(1);
    return { name, zoneHint, quantity };
}

/** match a free-text zone hint to an existing zone (ported from matchZone). */
export function matchZone(
    hint: string | null,
    zones: Zone[],
    type: SpaceTypeId
): Zone | null {
    if (!hint) return null;
    const h = hint.toLowerCase();

    for (const z of zones) {
        if (zoneName(z, type).toLowerCase() === h) return z;
    }
    for (const z of zones) {
        const nm = zoneName(z, type).toLowerCase();
        if (nm.includes(h) || h.includes(nm)) return z;
    }
    if (/top|first|upper/.test(h)) return zones[0] ?? null;
    if (/bottom|last|lower/.test(h)) return zones[zones.length - 1] ?? null;
    if (/middle|mid/.test(h)) return zones[Math.floor(zones.length / 2)] ?? null;
    if (/door/.test(h)) return zones.find((z) => /door/i.test(z.label || '')) ?? null;
    if (/veg|crisper|drawer/.test(h)) {
        return zones.find((z) => /veg|drawer/i.test(z.label || '')) ?? null;
    }
    return null;
}
