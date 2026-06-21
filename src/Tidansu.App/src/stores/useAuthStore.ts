import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    /** epoch ms at which the access token expires */
    expiresAt: number;
}

const STORAGE_KEY = 'tidansu_auth';

function load(): AuthTokens | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try {
            return JSON.parse(raw) as AuthTokens;
        } catch {
            localStorage.removeItem(STORAGE_KEY);
        }
    }
    return null;
}

/**
 * Holds the JWT access + refresh tokens from the magic-link flow. The user's
 * profile/plan lives in `useSessionStore`; this store is purely the credential.
 */
export const useAuthStore = defineStore('auth', () => {
    const tokens = ref<AuthTokens | null>(load());

    watch(
        tokens,
        () => {
            if (tokens.value) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens.value));
            } else {
                localStorage.removeItem(STORAGE_KEY);
            }
        },
        { deep: true }
    );

    const accessToken = computed(() => tokens.value?.accessToken ?? null);
    const refreshToken = computed(() => tokens.value?.refreshToken ?? null);
    const hasTokens = computed(() => tokens.value !== null);
    /** True when the access token is present and not past its expiry. */
    const isAccessTokenValid = computed(
        () => tokens.value !== null && Date.now() < tokens.value.expiresAt
    );

    function setTokens(nextAccessToken: string, nextRefreshToken: string, expiresInSeconds: number): void {
        tokens.value = {
            accessToken: nextAccessToken,
            refreshToken: nextRefreshToken,
            expiresAt: Date.now() + expiresInSeconds * 1000,
        };
    }

    function clear(): void {
        tokens.value = null;
    }

    return { tokens, accessToken, refreshToken, hasTokens, isAccessTokenValid, setTokens, clear };
});
