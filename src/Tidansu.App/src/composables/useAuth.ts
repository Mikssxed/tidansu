import type { AuthResponseApiOperationResult } from '@/api/apiClient/models';
import type { Plan } from '@/data/types';
import { useApiClient } from '@/composables/useApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useSpacesStore } from '@/stores/useSpacesStore';

/**
 * Real magic-link auth against the backend. `requestMagicLink` emails a one-time
 * link (returning a dev link in development); `consume` exchanges the link token
 * for JWT + refresh tokens and the user profile; `refresh` rotates the pair.
 */
export function useAuth() {
    const client = useApiClient();
    const auth = useAuthStore();
    const session = useSessionStore();
    const spaces = useSpacesStore();

    /** Returns the dev sign-in link in development, otherwise null. */
    async function requestMagicLink(email: string, returnUrl?: string): Promise<string | null> {
        const res = await client.api.auth.magicLink.post({ email, returnUrl: returnUrl ?? null });
        return res?.data?.devLink ?? null;
    }

    async function consume(token: string): Promise<void> {
        const res = await client.api.auth.consume.post({ token });
        applyAuth(res);
        // Load (and on first sign-in, seed) the user's spaces before we navigate.
        await spaces.hydrate(true);
    }

    /** Rotates the refresh token; clears the session on failure. Returns success. */
    async function refresh(): Promise<boolean> {
        const refreshToken = auth.refreshToken;
        if (!refreshToken) return false;
        try {
            const res = await client.api.auth.refresh.post({ refreshToken });
            applyAuth(res);
            return true;
        } catch {
            signOut();
            return false;
        }
    }

    function signOut(): void {
        auth.clear();
        session.signOut();
        spaces.reset();
    }

    function applyAuth(res: AuthResponseApiOperationResult | undefined): void {
        const data = res?.data;
        if (!data?.accessToken || !data.user) {
            throw new Error('Malformed authentication response.');
        }
        auth.setTokens(data.accessToken, data.refreshToken, data.expiresIn);
        session.setUser(
            { name: data.user.name, email: data.user.email, plan: data.user.plan as Plan },
            data.user.syncOn
        );
    }

    return { requestMagicLink, consume, refresh, signOut };
}
