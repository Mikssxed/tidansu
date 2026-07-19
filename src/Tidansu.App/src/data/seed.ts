import { inDays } from '@/data/dates';
import { buildZones, summarize, uid } from '@/data/spaces';
import type { Item, Space } from '@/data/types';

/** Starter space seeded on first sign-in — ported from seedFridge() in data.jsx. */
export function seedFridge(): Space {
    const zones = buildZones('fridge');
    // buildZones('fridge') always yields 5 zones (see ZONE_TEMPLATES.fridge).
    const s1 = zones[0]!;
    const s2 = zones[1]!;
    const s3 = zones[2]!;
    const door = zones[3]!;
    const veg = zones[4]!;

    const mk = (
        name: string,
        zoneId: string,
        quantity: number,
        expDays: number | null,
        tags: string[] = []
    ): Item => ({
        id: uid('item'),
        name,
        zoneId,
        quantity,
        tags,
        dateAdded: inDays(-Math.floor(Math.random() * 8) - 1),
        expiry: expDays == null ? null : inDays(expDays),
        photo: null,
        slotIndex: null,
        depth: 'front',
        level: 1,
    });

    const items: Item[] = [
        mk('Milk', s1.id, 1, 3, ['dairy', 'open']),
        mk('Leftover pasta', s1.id, 1, 1, ['leftovers']),
        mk('Orange juice', door.id, 1, 2, ['drinks']),
        mk('Eggs', s2.id, 12, 16, ['dairy']),
        mk('Greek yogurt', s2.id, 4, 9, ['dairy']),
        mk('Leftover curry', s3.id, 1, 0, ['leftovers', 'spicy']),
        mk('Cheddar', s3.id, 1, 24, ['dairy']),
        mk('Butter', door.id, 1, 30, ['dairy']),
        mk('Ketchup', door.id, 1, 120, ['condiment']),
        mk('Carrots', veg.id, 1, 12, ['veg']),
    ];

    // assign slot indices in order per zone
    const counter: Record<string, number> = {};
    items.forEach((it) => {
        const idx = (counter[it.zoneId] ?? -1) + 1;
        counter[it.zoneId] = idx;
        it.slotIndex = idx;
    });

    return {
        id: uid('space'),
        name: 'My fridge',
        type: 'fridge',
        viewMode: 'list',
        canvasMode: 'columns',
        layoutColumns: 1,
        columnLabels: null,
        zones,
        items,
        ...summarize(zones, items),
    };
}
