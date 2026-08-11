namespace Tidansu.Domain.Constants;

// Single authority for the current legal document versions. The request validator
// (RequestMagicLinkCommandValidator) rejects any AcceptedTermsVersion that doesn't
// match CurrentTermsVersion, and ConsumeMagicLinkCommandHandler writes that same
// value into the per-user TermsAcceptance record — so bumping a version here is the
// one edit needed to require re-acceptance on the next request/consume cycle.
//
// ⚠️ CurrentTermsVersion MUST be bumped together with the frontend TERMS_VERSION
// constant (src/Tidansu.App/src/data/legal.ts) and the version shown in the legal
// content components — the SPA ships inside the API's wwwroot, so a mismatch is
// always a dev-time drift bug, surfaced immediately as a clean 400 on every login.
public static class TermsPolicy
{
    public const string CurrentTermsVersion = "2026-08-11";
    public const string CurrentPrivacyVersion = "2026-08-11";
}
