---
name: verify-stripe-webhook-without-cli
description: Hand-sign Stripe webhook fixtures with Python HMAC when the Stripe CLI isn't installed, to drive StripeBillingService.HandleWebhookAsync end-to-end
metadata:
  type: feedback
---

Driving `StripeBillingService.HandleWebhookAsync` (real signature verification, real
claim-then-mutate transaction) when the Stripe CLI (`stripe listen`/`stripe trigger`)
is not installed in the environment (e.g. B-10 async-payment-settlement handlers).

**Why:** the tech-tasks' verification step assumes `stripe listen`/`stripe trigger`,
but those aren't always available. A hand-signed fixture is a legitimate substitute —
it exercises the *same* `EventUtility.ConstructEvent` signature-verify path Stripe's
CLI would, not a mocked shortcut.

**How to apply:**
- Stripe's webhook signature is a plain HMAC-SHA256: `signed_payload =
  f"{timestamp}.{raw_body}"`, `sig = hmac_sha256(webhook_secret, signed_payload).hex()`,
  header `Stripe-Signature: t={timestamp},v1={sig}`. A ~40-line Python script with
  `hmac`/`hashlib`/`urllib.request` reproduces this — no Stripe SDK needed on the
  sender side. Boot the API with `StripeSettings__Enabled=true`,
  `StripeSettings__SecretKey=sk_test_<anything>` (never called for a webhook-only
  drive except the best-effort `TryGetPeriodEndAsync`, which is wrapped in
  try/catch and degrades to `null` on a fake key — harmless), and
  `StripeSettings__WebhookSecret=whsec_<anything-you-also-put-in-the-script>`.
- **Gotcha:** Stripe.net's `EventUtility.ConstructEvent` also validates the fixture's
  `api_version` field against the version the installed `Stripe.net` package expects,
  and throws (surfaces as "Invalid webhook signature" — misleading, it's not actually
  a signature failure) on a mismatch. Check the real error text in the API log (it
  names the expected version, e.g. `2026-05-27.dahlia`) and set the fixture's
  `api_version` to exactly that string — don't guess a recent-looking date.
- To get a **real** `ClientReferenceId` to grant against: use the app's own
  dev-mode magic-link flow (`POST /api/auth/magic-link` returns `devLink` with the
  raw token in `Development`; `POST /api/auth/consume` creates the user and returns
  a JWT) — decode the JWT payload (base64, no need to verify) to read the `sub`
  claim as the user id. This proves the grant via the *actual* authenticated
  identity path, and a follow-up `magic-link`+`consume` round-trip re-reads the
  user's `plan` from the DB through the app's real read path (not just log/SQL
  inspection) to close the loop.
- See [[verify-prod-env-drives]] for the base env-var-boot recipe and
  [[verify-prod-auth-without-real-smtp]] for the sibling magic-link-without-SMTP
  technique this reuses.
