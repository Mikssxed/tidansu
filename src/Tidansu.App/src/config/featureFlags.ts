/**
 * Build/config feature flags, read once from Vite env at module load.
 *
 * Same pattern as the `VITE_DISABLE_AUTH` route-guard bypass: a `VITE_*` string
 * env var compared against `'true'`, so an unset/blank value defaults the flag
 * OFF. Bundled statically by Vite — flipping a flag requires a rebuild.
 */

/**
 * Gate for the pre-Checkout consumer-law consent step (FR-11). When ON, an
 * upgrade routes through `CheckoutConsentStep` (mandatory disclosures + express
 * withdrawal-waiver consent + a "Subscribe & pay" obligation-to-pay button)
 * before Stripe Checkout. Default OFF so the existing happy-path flow is
 * unchanged until legal copy is finalized.
 */
export const checkoutConsentEnabled: boolean = import.meta.env.VITE_CHECKOUT_CONSENT === 'true';
