import { QueryClient } from '@tanstack/vue-query';

/**
 * Shared TanStack Query client — installed via VueQueryPlugin in main.ts and used
 * imperatively (fetchQuery/invalidateQueries) from the spaces store so server reads
 * are cached/deduped while the store stays the reactive source of truth for views.
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    },
});

/** Page-scoped key for a spaces-summary page (`GET /api/spaces?page=`). */
export const spacesQueryKey = (page: number) => ['spaces', page] as const;
/** Key for one space's full (photo-less) contents graph (`GET /api/spaces/{id}`). */
export const spaceContentsKey = (id: string) => ['space', id] as const;
export const PLANS_QUERY_KEY = ['plans'] as const;
