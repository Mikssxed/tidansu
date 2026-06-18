/* Date + expiry helpers — ported from data.jsx. */

export const DAY = 86_400_000;
export const now = (): number => Date.now();
export const inDays = (n: number): string => new Date(now() + n * DAY).toISOString();

export type ExpiryStatus = 'gone' | 'today' | 'soon' | 'ok';

export function daysUntil(iso: string | null): number | null {
    if (!iso) return null;
    return Math.round((new Date(iso).getTime() - now()) / DAY);
}

export function expiryStatus(iso: string | null): ExpiryStatus | null {
    const d = daysUntil(iso);
    if (d === null) return null;
    if (d < 0) return 'gone';
    if (d === 0) return 'today';
    if (d <= 3) return 'soon';
    return 'ok';
}

export function expiryLabel(iso: string | null): string | null {
    const d = daysUntil(iso);
    if (d === null) return null;
    if (d < 0) return `${Math.abs(d)}d ago`;
    if (d === 0) return 'today';
    if (d === 1) return 'tomorrow';
    if (d <= 14) return `${d} days`;
    return new Date(iso!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
