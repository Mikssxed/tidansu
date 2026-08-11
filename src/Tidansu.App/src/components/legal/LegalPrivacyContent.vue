<template>
    <div class="legal-content flex flex-col gap-6 text-[14px] leading-relaxed text-text-2">
        <header>
            <h1 class="text-[22px] font-bold leading-tight text-text">Privacy Policy</h1>
            <p class="mt-1.5 text-[13px] text-text-3">
                Version {{ version }} · Last updated {{ lastUpdated }}
            </p>
            <p
                class="mt-3 rounded-ctrl border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-[13px] text-text-2"
            >
                This is a template drafted for a hobby/SaaS project and is pending review by a
                qualified lawyer before it is relied on as the operator's final Privacy Policy.
            </p>
        </header>

        <section>
            <h2 class="text-[15px] font-semibold text-text">1. Who this policy covers</h2>
            <p class="mt-2">
                This Privacy Policy explains how Tidansu ("we", "us") collects, uses, and
                protects personal data of people who use the Service, in line with the EU General
                Data Protection Regulation (GDPR) and applicable Polish data-protection law. It
                should be read together with our
                <RouterLink
                    :to="{ name: 'legalTerms' }"
                    class="text-text underline decoration-border-strong underline-offset-2 hover:text-pri-bg"
                >
                    Terms of Service
                </RouterLink>.
            </p>
        </section>

        <section>
            <h2 class="text-[15px] font-semibold text-text">2. Data we collect</h2>
            <ul class="mt-2 list-disc space-y-1 pl-5">
                <li>
                    <strong class="text-text">Email address</strong> — used to send you a
                    one-time "magic link" sign-in and for account-related notices. Passwordless
                    sign-in means we never receive or store a password.
                </li>
                <li>
                    <strong class="text-text">Inventory content you enter</strong> — your space
                    layouts, zones, items, notes, and expiry dates, plus item photos if you are on
                    the Pro plan and choose to add them.
                </li>
                <li>
                    <strong class="text-text">Payment data (Pro plan only)</strong> — handled
                    directly by our payment processor, <strong class="text-text">Stripe</strong>.
                    We do not receive or store your full card details; we retain only what is
                    necessary to manage your subscription (for example, plan status and billing
                    period).
                </li>
                <li>
                    <strong class="text-text">Session/local data</strong> — cookies or browser
                    local storage used solely to keep you signed in and to remember basic
                    preferences. We do not use third-party advertising or tracking cookies.
                </li>
            </ul>
        </section>

        <section>
            <h2 class="text-[15px] font-semibold text-text">3. Why we process this data (legal basis)</h2>
            <ul class="mt-2 list-disc space-y-1 pl-5">
                <li>To provide the Service you asked for (performance of a contract) — your account, your inventory data, and (if applicable) your subscription.</li>
                <li>To communicate with you about your account, such as sign-in links or service notices (performance of a contract / legitimate interest).</li>
                <li>To meet legal obligations, such as tax and accounting records for paid subscriptions (legal obligation).</li>
            </ul>
        </section>

        <section>
            <h2 class="text-[15px] font-semibold text-text">4. Who we share data with</h2>
            <p class="mt-2">
                We do not sell your personal data. We share data only with service providers who
                process it on our behalf and under contract, currently:
            </p>
            <ul class="mt-2 list-disc space-y-1 pl-5">
                <li>an email-delivery provider, to send magic-link sign-in emails;</li>
                <li>Stripe, to process Pro plan payments and manage subscriptions; and</li>
                <li>our hosting/infrastructure provider, to run the Service.</li>
            </ul>
        </section>

        <section>
            <h2 class="text-[15px] font-semibold text-text">5. How long we keep data</h2>
            <p class="mt-2">
                We keep your account and inventory data for as long as your account is active. If
                you delete your account, we delete your personal data and inventory content within
                a reasonable period, except where we are required to retain records for longer
                (for example, billing records for tax purposes).
            </p>
        </section>

        <section>
            <h2 class="text-[15px] font-semibold text-text">6. Your rights under GDPR</h2>
            <p class="mt-2">If you are in the EU/EEA (or otherwise covered by GDPR), you have the right to:</p>
            <ul class="mt-2 list-disc space-y-1 pl-5">
                <li>access the personal data we hold about you;</li>
                <li>have inaccurate data corrected (rectification);</li>
                <li>request deletion of your data (erasure), subject to legal retention needs;</li>
                <li>receive a copy of your data in a portable format (data portability); and</li>
                <li>object to, or request restriction of, certain processing.</li>
            </ul>
            <p class="mt-2">
                You may exercise these rights by contacting us at the address below. You also have
                the right to lodge a complaint with the Polish supervisory authority, the
                <strong class="text-text">Urząd Ochrony Danych Osobowych (UODO)</strong>, or with
                your local data-protection authority.
            </p>
        </section>

        <section>
            <h2 class="text-[15px] font-semibold text-text">7. Cookies and local storage</h2>
            <p class="mt-2">
                We use a minimal set of cookies/local-storage entries strictly necessary to keep
                you signed in and to remember basic UI preferences. We do not use analytics or
                advertising cookies that track you across other sites.
            </p>
        </section>

        <section>
            <h2 class="text-[15px] font-semibold text-text">8. Changes to this policy</h2>
            <p class="mt-2">
                We may update this Privacy Policy from time to time. Material changes will carry a
                new version identifier at the top of this page.
            </p>
        </section>

        <section>
            <h2 class="text-[15px] font-semibold text-text">9. Contact / data controller</h2>
            <p class="mt-2">
                For any question about this policy, or to exercise your data-subject rights,
                contact us using the details below.
            </p>
            <!--
                TODO: operator facts — never invent these. Fill in before go-live:
                - Data controller / legal entity name
                - Registration number (KRS / NIP / REGON, as applicable)
                - Registered address
                - Contact email for data requests (and DPO contact, if one is appointed)
            -->
            <ul class="mt-2 space-y-1 text-text-3">
                <li>Data controller: [TODO: legal entity / trading name]</li>
                <li>Registration no.: [TODO: KRS / NIP / REGON]</li>
                <li>Registered address: [TODO: registered address]</li>
                <li>Contact for data requests: [TODO: contact email]</li>
                <li>Data protection contact (if appointed): [TODO: DPO name/email, or "not applicable"]</li>
            </ul>
        </section>
    </div>
</template>

<script setup lang="ts">
    import { PRIVACY_VERSION } from '@/data/legal';
    import { computed } from 'vue';

    const version = computed(() => PRIVACY_VERSION);
    const lastUpdated = computed(() => PRIVACY_VERSION);
</script>
