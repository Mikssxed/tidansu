# Memory index

- [Config fail-loud & secret logging](arch_config-fail-loud-and-secret-logging.md) — prod config guards mirror the JWT-secret startup guard; bearer creds/links never in logs
- [Email / magic-link delivery seam](email-magic-link-delivery-seam.md) — IEmailService + FluentEmail SMTP, dev-file vs prod-send; a delivery-only change needs no Kiota/frontend
- [Billing / Stripe webhook trust seam](billing-stripe-webhook-trust-seam.md) — free-Pro prod leak, webhook=sole Pro authority, atomic idempotency, downgrade read-only already in PlanPolicy
</content>
