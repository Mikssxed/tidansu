import { toDtoBody, toSpace } from '@/api/spaceMapping';
import { useApiClient } from '@/composables/useApiClient';
import type { PaywallReason } from '@/data/paywall';
import type { Space } from '@/data/types';

const PAYWALL_REASONS: PaywallReason[] = ['spaces', 'zones', 'items', 'photos', 'sync'];

/**
 * Pulls the plan-limit reason out of a server 403. The body is
 * `{ errors: { plan: [reason] } }`, which Kiota surfaces on the thrown error's
 * `additionalData` (deserialised as ProblemDetails). Returns null when absent.
 */
export function planReasonOf(error: unknown): PaywallReason | null {
    const additional = (error as { additionalData?: Record<string, unknown> })?.additionalData;
    const errors = additional?.errors as { plan?: unknown } | undefined;
    const reason = Array.isArray(errors?.plan) ? errors!.plan[0] : undefined;
    return PAYWALL_REASONS.includes(reason as PaywallReason) ? (reason as PaywallReason) : null;
}

/** Thin wrapper over the generated spaces endpoints, mapping to/from the app `Space` type. */
export function useSpacesApi() {
    const client = useApiClient();

    return {
        async list(): Promise<Space[]> {
            const res = await client.api.spaces.get();
            return (res?.data ?? []).map(toSpace);
        },
        async create(space: Space): Promise<Space> {
            const res = await client.api.spaces.post(toDtoBody(space));
            return res?.data ? toSpace(res.data) : space;
        },
        async update(space: Space): Promise<Space> {
            const res = await client.api.spaces.byId(space.id).put(toDtoBody(space));
            return res?.data ? toSpace(res.data) : space;
        },
        async remove(id: string): Promise<void> {
            await client.api.spaces.byId(id).delete();
        },
    };
}
