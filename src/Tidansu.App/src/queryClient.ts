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

export const SPACES_QUERY_KEY = ['spaces'] as const;
