/**
 * Legal document version identifiers (B-29).
 *
 * ⚠️ MUST be bumped together with the backend authority
 * `Tidansu.Domain/Constants/TermsPolicy.cs` (`CurrentTermsVersion` /
 * `CurrentPrivacyVersion`) — and the version text shown in
 * `components/legal/LegalTermsContent.vue` / `LegalPrivacyContent.vue`. There is
 * deliberately no "current legal version" endpoint (product-owner decision), so a
 * mismatch between this file and the backend constants is not caught at runtime
 * until a real request — every magic-link request will 400 (the backend validator
 * requires an exact match). Bump all three together in the same change.
 */
export const TERMS_VERSION = '2026-08-11';
export const PRIVACY_VERSION = '2026-08-11';
