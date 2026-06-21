import { useApiClient } from '@/composables/useApiClient';
import type { Plan } from '@/data/types';

/** Wraps the account/plan/sync endpoints. */
export function useAccountApi() {
    const client = useApiClient();

    return {
        get: () => client.api.account.get(),
        changePlan: (plan: Plan) => client.api.account.plan.put({ plan }),
        setSync: (syncOn: boolean) => client.api.account.sync.put({ syncOn }),
    };
}
