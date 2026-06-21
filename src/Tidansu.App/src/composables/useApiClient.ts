import { createApiClient, type ApiClient } from '@/api/apiClient/apiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import {
    AllowedHostsValidator,
    BaseBearerTokenAuthenticationProvider,
    type AccessTokenProvider,
} from '@microsoft/kiota-abstractions';
import { DefaultRequestAdapter } from '@microsoft/kiota-bundle';

let client: ApiClient | null = null;

/**
 * Lazily builds the Kiota client. Requests carry the current access token as a
 * Bearer header when present (anonymous endpoints simply ignore it). Same-origin
 * base URL → `/api/...` is proxied to the backend in dev and served from wwwroot
 * in prod.
 */
export function useApiClient(): ApiClient {
    if (client) return client;

    const auth = useAuthStore();

    const tokenProvider: AccessTokenProvider = {
        getAuthorizationToken: () => Promise.resolve(auth.accessToken ?? ''),
        // Empty validator → all hosts allowed.
        getAllowedHostsValidator: () => new AllowedHostsValidator(),
    };

    const adapter = new DefaultRequestAdapter(new BaseBearerTokenAuthenticationProvider(tokenProvider));
    adapter.baseUrl = window.location.origin;

    client = createApiClient(adapter);
    return client;
}
