import type { PlanCapsDto } from '@/api/apiClient/models';
import { useApiClient } from '@/composables/useApiClient';
import { applyServerCaps, type ServerPlanCaps } from '@/data/plans';
import type { Plan } from '@/data/types';
import { PLANS_QUERY_KEY, queryClient } from '@/queryClient';

/** Map a generated (nullable) PlanCapsDto to the app's ServerPlanCaps shape. */
function toServerCaps(dto: PlanCapsDto): ServerPlanCaps {
    return {
        plan: (dto.plan ?? 'free') as Plan,
        spaces: dto.spaces ?? null,
        zones: dto.zones ?? null,
        items: dto.items ?? null,
        photos: dto.photos ?? false,
        sync: dto.sync ?? false,
    };
}

/**
 * Loads the server-authoritative plan caps from `/api/plans` (anonymous) and applies
 * them over the local presentation data. Caps are static, so the query is cached
 * forever; the bundled fallbacks stand in until this resolves. Call once at startup.
 */
export function usePlanCaps() {
    const client = useApiClient();

    async function hydrate(): Promise<void> {
        const res = await queryClient.fetchQuery({
            queryKey: PLANS_QUERY_KEY,
            queryFn: () => client.api.plans.get(),
            staleTime: Infinity,
        });
        const list = res?.data ?? [];
        applyServerCaps(list.map(toServerCaps));
    }

    return { hydrate };
}
