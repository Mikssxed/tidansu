import type { Plan } from '@/data/types';
import { ref } from 'vue';

export interface PlanDef {
    id: Plan;
    name: string;
    tagline: string;
    priceM: number;
    priceY: number;
    spaces: number;
    zones: number;
    items: number;
    photos: boolean;
    sync: boolean;
    history: boolean;
}

/**
 * Presentation data + fallback caps. The enforced caps (spaces/zones/items/photos/
 * sync) are server-authoritative: `applyServerCaps` overwrites them from `/api/plans`
 * at startup (see `usePlanCaps`). The literals here are only the pre-load seed so the
 * UI never flashes; prices/taglines/history stay frontend-owned. Pro caps use Infinity
 * (see isInf) — the server sends null, which maps to Infinity.
 */
const FALLBACK_PLANS: Record<Plan, PlanDef> = {
    free: {
        id: 'free',
        name: 'Free',
        tagline: 'For a shelf or two.',
        priceM: 0,
        priceY: 0,
        spaces: 2,
        zones: 6,
        items: 50,
        photos: false,
        sync: false,
        history: false,
    },
    pro: {
        id: 'pro',
        name: 'Pro',
        tagline: 'For the whole kitchen.',
        priceM: 5,
        priceY: 48, // $48/yr ≈ $4/mo — save 20%
        spaces: Infinity,
        zones: Infinity,
        items: Infinity,
        photos: true,
        sync: true,
        history: true,
    },
};

// Reactive plan table — seeded with the fallbacks, replaced when server caps load.
// Every consumer reads through `planOf`, so the swap propagates reactively.
const plansRef = ref<Record<Plan, PlanDef>>(FALLBACK_PLANS);

export const isInf = (n: number): boolean => !isFinite(n);

export const planOf = (plan: Plan | null | undefined): PlanDef => plansRef.value[plan ?? 'free'];

/** Enforced caps for one plan as served by `/api/plans`; a null numeric cap = unlimited. */
export interface ServerPlanCaps {
    plan: Plan;
    spaces: number | null;
    zones: number | null;
    items: number | null;
    photos: boolean;
    sync: boolean;
}

/**
 * Merge server-authoritative enforced caps over the local presentation data. Numeric
 * `null` (unlimited) maps to Infinity so `isInf` keeps working downstream.
 */
export function applyServerCaps(caps: ServerPlanCaps[]): void {
    const next = { ...plansRef.value };
    for (const c of caps) {
        const base = next[c.plan] ?? FALLBACK_PLANS[c.plan];
        next[c.plan] = {
            ...base,
            spaces: c.spaces ?? Infinity,
            zones: c.zones ?? Infinity,
            items: c.items ?? Infinity,
            photos: c.photos,
            sync: c.sync,
        };
    }
    plansRef.value = next;
}

/** Numeric/boolean PlanDef fields surfaced as feature rows on pricing + account. */
export type PlanFeatureKey = 'spaces' | 'zones' | 'items' | 'photos' | 'sync' | 'history';

export interface PlanFeature {
    key: PlanFeatureKey;
    label: string;
    fmt: (value: number | boolean) => string;
}

/** Feature rows for the pricing cards + comparison table, ported from data.jsx. */
export const PLAN_FEATURES: PlanFeature[] = [
    { key: 'spaces', label: 'Spaces', fmt: (v) => (isInf(v as number) ? 'Unlimited' : `${v} spaces`) },
    {
        key: 'zones',
        label: 'Cabinets & shelves',
        fmt: (v) => (isInf(v as number) ? 'Unlimited' : `${v} per space`),
    },
    { key: 'items', label: 'Items', fmt: (v) => (isInf(v as number) ? 'Unlimited' : `${v} per space`) },
    { key: 'photos', label: 'Item photos', fmt: (v) => (v ? 'Yes' : '—') },
    { key: 'sync', label: 'Sync across devices', fmt: (v) => (v ? 'Yes' : 'This device only') },
    { key: 'history', label: 'Change history', fmt: (v) => (v ? 'Yes' : '—') },
];
