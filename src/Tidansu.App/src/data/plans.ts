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
