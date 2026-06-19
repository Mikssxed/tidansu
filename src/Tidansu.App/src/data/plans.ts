import type { Plan } from '@/data/types';

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

/** Ported from PLANS in data.jsx — Pro caps use Infinity (see isInf). */
export const PLANS: Record<Plan, PlanDef> = {
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

export const isInf = (n: number): boolean => !isFinite(n);

export const planOf = (plan: Plan | null | undefined): PlanDef => PLANS[plan ?? 'free'];

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
