import type { ZoneColor } from '@/data/types';

export type { ZoneColor };

/**
 * Zone palette — equal L/C, hue varies (see design tokens). Pro accent = amber.
 * These keys match the prototype's ZONE_COLORS so seeded/ported data maps cleanly.
 */

export const zoneBgClasses: Record<ZoneColor, string> = {
    blue: 'bg-zone-blue',
    green: 'bg-zone-green',
    amber: 'bg-zone-amber',
    pink: 'bg-zone-pink',
    gray: 'bg-zone-gray',
};

export const zoneTextClasses: Record<ZoneColor, string> = {
    blue: 'text-zone-blue',
    green: 'text-zone-green',
    amber: 'text-zone-amber',
    pink: 'text-zone-pink',
    gray: 'text-zone-gray',
};

import type { ExpiryStatus } from '@/data/dates';

export type { ExpiryStatus };

/** Expiry status -> status token color (see expiryStatus helper). */
export const expiryTextClasses: Record<ExpiryStatus, string> = {
    gone: 'text-danger',
    today: 'text-danger',
    soon: 'text-warn',
    ok: 'text-text-3',
};
