<template>
    <div class="legal-content flex flex-col gap-6 text-[14px] leading-relaxed text-text-2">
        <header>
            <h1 class="text-[22px] font-bold leading-tight text-text">Terms of Service</h1>
            <p class="mt-1.5 text-[13px] text-text-3">
                Version {{ version }} · Last updated {{ lastUpdated }}
            </p>
            <p
                class="mt-3 rounded-ctrl border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-[13px] text-text-2"
            >
                This is a template drafted for a hobby/SaaS project and is pending review by a
                qualified lawyer before it is relied on as the operator's final Terms of Service.
            </p>
        </header>

        <section>
            <h2 class="text-[15px] font-semibold text-text">1. Acceptance of these Terms</h2>
            <p class="mt-2">
                By creating an account or otherwise using Tidansu (the "Service"), you agree to be
                bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do
                not use the Service. Where required, you confirm acceptance explicitly (for
                example, via a checkbox) before your account is created.
            </p>
        </section>

        <section>
            <h2 class="text-[15px] font-semibold text-text">2. Description of the Service</h2>
            <p class="mt-2">
                Tidansu is a spatial inventory application that lets you map physical storage
                (fridges, freezers, cellars, cabinets, and similar) as digital layouts and track
                the items kept inside them, including expiry dates. The Service is provided as a
                web application accessed through your browser.
            </p>
        </section>

        <section>
            <h2 class="text-[15px] font-semibold text-text">3. Accounts and eligibility</h2>
            <p class="mt-2">
                Sign-in is passwordless: we email you a one-time "magic link" to create or access
                your account. You are responsible for keeping access to the email address on your
                account secure, and for all activity that occurs under your account. You must be
                legally capable of entering into a binding contract to use the Service.
            </p>
        </section>

        <section>
            <h2 class="text-[15px] font-semibold text-text">4. Plans, Pro subscription, and billing</h2>
            <p class="mt-2">
                Tidansu offers a Free plan with limited spaces, zones, items, and no photos or
                sync, and a paid Pro plan that removes those limits. Current plan details and
                pricing are shown on our
                <RouterLink
                    :to="{ name: 'pricing' }"
                    class="text-text underline decoration-border-strong underline-offset-2 hover:text-pri-bg"
                >
                    Pricing
                </RouterLink>
                page, which forms part of these Terms by reference.
            </p>
            <p class="mt-2">
                Paid Pro subscriptions are processed by our payment provider, Stripe. Stripe
                handles your payment details directly — Tidansu does not store your card
                information. Subscriptions renew automatically for each billing period until
                cancelled; you can cancel at any time from your Account page, and you keep Pro
                access until the end of the period you already paid for.
            </p>
        </section>

        <section>
            <h2 class="text-[15px] font-semibold text-text">5. Acceptable use</h2>
            <p class="mt-2">You agree not to:</p>
            <ul class="mt-2 list-disc space-y-1 pl-5">
                <li>use the Service for any unlawful purpose or in violation of these Terms;</li>
                <li>attempt to gain unauthorized access to the Service, other accounts, or the systems behind it;</li>
                <li>interfere with or disrupt the integrity or performance of the Service;</li>
                <li>upload content that infringes the rights of others or that is unlawful, abusive, or harmful; or</li>
                <li>use automated means to scrape or bulk-extract data from the Service without our prior written consent.</li>
            </ul>
            <p class="mt-2">
                We may suspend or terminate accounts that violate this section.
            </p>
        </section>

        <section>
            <h2 class="text-[15px] font-semibold text-text">6. Your content and data</h2>
            <p class="mt-2">
                You retain ownership of the content you add to the Service (space layouts, zone
                and item names, notes, expiry dates, and — where the Pro plan is active —
                photos). You grant us only the limited right to store, process, and display that
                content back to you as necessary to operate the Service. We do not sell your
                content or personal data. See our
                <RouterLink
                    :to="{ name: 'legalPrivacy' }"
                    class="text-text underline decoration-border-strong underline-offset-2 hover:text-pri-bg"
                >
                    Privacy Policy
                </RouterLink>
                for details on how personal data is handled.
            </p>
        </section>

        <section>
            <h2 class="text-[15px] font-semibold text-text">7. Disclaimers</h2>
            <p class="mt-2">
                The Service is provided "as is" and "as available", without warranties of any
                kind, whether express or implied, including but not limited to implied warranties
                of merchantability, fitness for a particular purpose, and non-infringement. In
                particular, Tidansu is an organizational aid: we do not guarantee the accuracy of
                any expiry date you enter, and you remain solely responsible for judging whether
                food or other items are safe to use.
            </p>
        </section>

        <section>
            <h2 class="text-[15px] font-semibold text-text">8. Limitation of liability</h2>
            <p class="mt-2">
                To the maximum extent permitted by applicable law, Tidansu and its operator will
                not be liable for any indirect, incidental, special, consequential, or punitive
                damages, or any loss of data, arising out of or related to your use of the
                Service. Nothing in these Terms excludes or limits liability that cannot be
                excluded or limited under applicable law, including the mandatory consumer
                protections available to you under Polish and EU law.
            </p>
        </section>

        <section>
            <h2 class="text-[15px] font-semibold text-text">9. Termination</h2>
            <p class="mt-2">
                You may stop using the Service and delete your account at any time. We may
                suspend or terminate your access if you materially breach these Terms. Where we
                terminate an account for reasons other than your breach, we will make reasonable
                efforts to give advance notice.
            </p>
        </section>

        <section>
            <h2 class="text-[15px] font-semibold text-text">10. Changes to these Terms</h2>
            <p class="mt-2">
                We may update these Terms from time to time. Material changes will carry a new
                version identifier at the top of this page. Continued use of the Service after a
                new version takes effect constitutes acceptance of the updated Terms.
            </p>
        </section>

        <section>
            <h2 class="text-[15px] font-semibold text-text">11. Governing law</h2>
            <p class="mt-2">
                These Terms are governed by the laws of <strong class="text-text">Poland</strong>,
                without prejudice to any mandatory consumer-protection rules of the country in
                which you are habitually resident. Any dispute not resolved informally will be
                subject to the exclusive jurisdiction of the competent court for
                <!-- TODO: specific competent court / city (operator's registered seat) — do not invent. -->
                <span class="italic text-text-3">[TODO: competent court / city, per operator's registered seat]</span>,
                Poland, except where mandatory consumer law grants you the right to bring
                proceedings in your own country of residence.
            </p>
        </section>

        <section>
            <h2 class="text-[15px] font-semibold text-text">12. Contact</h2>
            <p class="mt-2">
                Questions about these Terms can be sent to the contact address below.
            </p>
            <!--
                TODO: operator facts — never invent these. Fill in before go-live:
                - Legal entity / trading name
                - Registration number (KRS / NIP / REGON, as applicable)
                - Registered address
                - Contact email
            -->
            <ul class="mt-2 space-y-1 text-text-3">
                <li>Operator: [TODO: legal entity / trading name]</li>
                <li>Registration no.: [TODO: KRS / NIP / REGON]</li>
                <li>Registered address: [TODO: registered address]</li>
                <li>Contact: [TODO: contact email]</li>
            </ul>
        </section>
    </div>
</template>

<script setup lang="ts">
    import { TERMS_VERSION } from '@/data/legal';
    import { computed } from 'vue';

    const version = computed(() => TERMS_VERSION);
    const lastUpdated = computed(() => TERMS_VERSION);
</script>
