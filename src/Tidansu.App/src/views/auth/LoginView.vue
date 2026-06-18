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

            <!-- State A — enter email -->
            <form
                v-if="!sent"
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

                <BaseButton
                    type="submit"
                    class="mt-4 w-full"
                    :disabled="sendDisabled"
                >
                    Send magic link
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
                <h1 class="mt-4 text-[24px] font-bold leading-tight">Check your inbox</h1>
                <p class="mt-2 text-[14px] text-text-2">
                    We sent a magic link to <span class="font-semibold text-text">{{ email }}</span>.
                </p>

                <BaseButton
                    class="mt-6 w-full"
                    @click="openLink"
                >
                    Open the link
                </BaseButton>

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
                        @click="resend"
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
    import { useSessionStore } from '@/stores/useSessionStore';
    import { computed, ref } from 'vue';
    import { useRoute, useRouter } from 'vue-router';

    const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

    const session = useSessionStore();
    const router = useRouter();
    const route = useRoute();

    const email = ref('');
    const sent = ref(false);

    const emailValid = computed(() => EMAIL_RE.test(email.value.trim()));
    const sendDisabled = computed(() => !emailValid.value);

    function sendLink() {
        if (!emailValid.value) return;
        sent.value = true;
    }

    function openLink() {
        session.signIn(email.value.trim());
        const returnUrl = route.query.returnUrl as string | undefined;
        router.push(returnUrl || { name: 'spaces' });
    }

    function useDifferentEmail() {
        sent.value = false;
    }

    function resend() {
        // Prototype stand-in — a real provider re-issues the emailed link here.
        sent.value = true;
    }
</script>
