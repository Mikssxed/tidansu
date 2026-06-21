<template>
    <div class="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-14">
        <RouterLink
            :to="{ name: 'landing' }"
            class="mb-6 inline-flex items-center gap-1.5 text-[14px] text-text-2 transition-colors hover:text-text"
        >
            <BaseIcon
                name="arrowL"
                :size="16"
            />
            Back
        </RouterLink>

        <BaseCard
            large
            class="p-[calc(26px*var(--pad))]"
        >
            <div class="flex items-center gap-2 font-extrabold tracking-tight">
                <span class="flex size-7 items-center justify-center rounded-ctrl bg-pri-bg text-pri-fg">
                    <BaseIcon
                        name="cabinet"
                        :size="16"
                    />
                </span>
                Tidansu
            </div>

            <!-- State C — consuming the magic link -->
            <div
                v-if="consuming"
                class="mt-8 flex flex-col items-center py-6 text-center"
            >
                <BaseIcon
                    name="cabinet"
                    :size="28"
                    class="animate-pulse text-text-2"
                />
                <p class="mt-4 text-[15px] text-text-2">Signing you in…</p>
            </div>

            <!-- State A — enter email -->
            <form
                v-else-if="!sent"
                class="mt-6"
                @submit.prevent="sendLink"
            >
                <h1 class="text-[24px] font-bold leading-tight">Sign in or create your account</h1>
                <p class="mt-2 text-[14px] text-text-2">
                    No password to remember — we email you a magic link that signs you in.
                </p>

                <label
                    for="email"
                    class="mt-6 block text-[13px] font-medium text-text-2"
                >
                    Email
                </label>
                <input
                    id="email"
                    v-model="email"
                    type="email"
                    inputmode="email"
                    autocomplete="email"
                    placeholder="you@example.com"
                    class="mt-1.5 h-11 w-full rounded-ctrl border border-border bg-surface-2 px-3.5 text-[15px] text-text placeholder:text-text-3 focus:border-border-strong focus:outline-none"
                />

                <p
                    v-if="error"
                    class="mt-3 text-[13px] text-danger"
                >
                    {{ error }}
                </p>

                <BaseButton
                    type="submit"
                    class="mt-4 w-full"
                    :disabled="sendDisabled"
                >
                    {{ sendLabel }}
                </BaseButton>

                <p class="mt-4 text-center text-[13px] text-text-3">
                    New here? The same link creates your account.
                </p>
            </form>

            <!-- State B — link sent -->
            <div v-else>
                <div
                    class="mt-6 flex size-12 items-center justify-center rounded-chip bg-ok/15 text-ok"
                >
                    <BaseIcon
                        name="check"
                        :size="24"
                    />
                </div>
                <h1 class="mt-6 text-[24px] font-bold leading-tight">Check your inbox</h1>
                <p class="mt-2 text-[14px] text-text-2">
                    We sent a magic link to <span class="font-semibold text-text">{{ email }}</span>.
                </p>

                <BaseButton
                    v-if="devLink"
                    class="mt-6 w-full"
                    @click="openDevLink"
                >
                    Open the link
                </BaseButton>

                <p
                    v-if="error"
                    class="mt-3 text-[13px] text-danger"
                >
                    {{ error }}
                </p>

                <div class="mt-4 flex items-center justify-center gap-4 text-[13px] text-text-2">
                    <button
                        type="button"
                        class="transition-colors hover:text-text"
                        @click="useDifferentEmail"
                    >
                        Use a different email
                    </button>
                    <span class="text-text-3">·</span>
                    <button
                        type="button"
                        class="transition-colors hover:text-text"
                        @click="sendLink"
                    >
                        Resend
                    </button>
                </div>
            </div>
        </BaseCard>
    </div>
</template>

<script setup lang="ts">
    import { BaseButton, BaseCard, BaseIcon } from '@/components/base';
    import { useAuth } from '@/composables/useAuth';
    import { computed, onMounted, ref } from 'vue';
    import { useRoute, useRouter } from 'vue-router';

    const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

    const auth = useAuth();
    const router = useRouter();
    const route = useRoute();

    const email = ref('');
    const sent = ref(false);
    const sending = ref(false);
    const consuming = ref(false);
    const devLink = ref<string | null>(null);
    const error = ref<string | null>(null);

    const emailValid = computed(() => EMAIL_RE.test(email.value.trim()));
    const sendDisabled = computed(() => !emailValid.value || sending.value);
    const sendLabel = computed(() => (sending.value ? 'Sending…' : 'Send magic link'));

    const returnUrl = computed(() => {
        const value = route.query.returnUrl;
        return typeof value === 'string' ? value : undefined;
    });

    async function sendLink() {
        if (!emailValid.value || sending.value) return;
        error.value = null;
        sending.value = true;
        try {
            devLink.value = await auth.requestMagicLink(email.value.trim(), returnUrl.value);
            sent.value = true;
        } catch {
            error.value = "We couldn't send your link. Please try again.";
        } finally {
            sending.value = false;
        }
    }

    async function consumeToken(token: string, target?: string) {
        consuming.value = true;
        error.value = null;
        try {
            await auth.consume(token);
            router.push(target || { name: 'spaces' });
        } catch {
            consuming.value = false;
            sent.value = false;
            error.value = 'That sign-in link is invalid or has expired. Request a new one.';
        }
    }

    function openDevLink() {
        if (!devLink.value) return;
        const url = new URL(devLink.value);
        const token = url.searchParams.get('token');
        const target = url.searchParams.get('returnUrl') ?? undefined;
        if (token) void consumeToken(token, target);
    }

    function useDifferentEmail() {
        sent.value = false;
        devLink.value = null;
        error.value = null;
    }

    onMounted(() => {
        // Magic-link callback: /login?token=…&returnUrl=…
        const token = route.query.token;
        if (typeof token === 'string' && token) {
            void consumeToken(token, returnUrl.value);
        }
    });
</script>
