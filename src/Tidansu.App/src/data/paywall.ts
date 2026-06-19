import type { IconName } from '@/components/icons';

/** The limit-reached moments the paywall is keyed by. */
export type PaywallReason = 'spaces' | 'zones' | 'items' | 'photos' | 'sync';

export interface PaywallCopy {
    icon: IconName;
    title: string;
    /** Body copy; the cap-count argument is ignored by the feature (photos/sync) reasons. */
    body: (limit: number) => string;
}

/** Reason copy for the paywall, ported from PAYWALL in data.jsx. */
export const PAYWALL: Record<PaywallReason, PaywallCopy> = {
    spaces: {
        icon: 'grid',
        title: 'Space limit reached',
        body: (n) =>
            `Free plan includes ${n} spaces. Upgrade to Pro for unlimited fridges, freezers, cabinets and cellars.`,
    },
    zones: {
        icon: 'columns',
        title: 'Cabinet limit reached',
        body: (n) =>
            `Free plan allows ${n} cabinets or shelves per space. Pro lets you draw as many as you like.`,
    },
    items: {
        icon: 'box',
        title: 'Item limit reached',
        body: (n) =>
            `This space is full — Free plan holds ${n} items per space. Pro removes the cap entirely.`,
    },
    photos: {
        icon: 'lock',
        title: 'Photos are a Pro feature',
        body: () => 'Add a photo to every item so you recognise it at a glance. Available on Pro.',
    },
    sync: {
        icon: 'restart',
        title: 'Sync is a Pro feature',
        body: () =>
            'Keep every space in step across your phone, tablet and laptop. Free plan stays on this device.',
    },
};

/** The Pro benefits checklist shown on every paywall, regardless of reason. */
export const PAYWALL_BENEFITS: { icon: IconName; label: string }[] = [
    { icon: 'grid', label: 'Unlimited spaces' },
    { icon: 'columns', label: 'Unlimited cabinets & shelves' },
    { icon: 'box', label: 'Unlimited items' },
    { icon: 'lock', label: 'Photos on every item' },
    { icon: 'restart', label: 'Sync across devices' },
];
