using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Stripe;
using Stripe.Checkout;
using Tidansu.Domain.Entities;
using Tidansu.Domain.Exceptions;
using Tidansu.Domain.Interfaces;
using Tidansu.Infrastructure.Persistence;
using Plan = Tidansu.Domain.Enums.Plan;

namespace Tidansu.Infrastructure.Services;

// Stripe-backed billing — registered only when StripeSettings.IsConfigured.
//
// The webhook is the SINGLE authority that grants/revokes Pro. Its ordering is
// deliberate and load-bearing: (1) verify the Stripe signature FIRST — a bad/forged
// signature mutates nothing; (2) for a mutating event, claim it in the idempotency
// ledger BEFORE touching plan state, so Stripe's at-least-once retries are no-ops;
// (3) resolve the account from a stored/authenticated id, never client-supplied data;
// (4) only then mutate. Do not reorder these.
public class StripeBillingService : IBillingService
{
    private readonly ILogger<StripeBillingService> _logger;
    private readonly IUserService _userService;
    private readonly IProcessedStripeEventStore _eventStore;
    private readonly TidansuDbContext _dbContext;
    private readonly StripeSettings _settings;

    public StripeBillingService(
        ILogger<StripeBillingService> logger,
        IUserService userService,
        IProcessedStripeEventStore eventStore,
        TidansuDbContext dbContext,
        IOptions<StripeSettings> settings)
    {
        _logger = logger;
        _userService = userService;
        _eventStore = eventStore;
        _dbContext = dbContext;
        _settings = settings.Value;
        StripeConfiguration.ApiKey = _settings.SecretKey;
    }

    public async Task<BillingChangeResult> ChangePlanAsync(User user, Plan target, CancellationToken cancellationToken = default)
    {
        if (target == Plan.Free)
        {
            return await CancelAtPeriodEndAsync(user, cancellationToken);
        }

        if (user.Plan == Plan.Pro)
        {
            return BillingChangeResult.Applied;
        }

        // Upgrade → Stripe Checkout. The webhook promotes the user to Pro on payment.
        var session = await new SessionService()
            .CreateAsync(BuildCheckoutOptions(user), cancellationToken: cancellationToken);
        _logger.LogInformation("Created Stripe checkout session {SessionId} for user {UserId}", session.Id, user.Id);

        return BillingChangeResult.Redirect(session.Url
            ?? throw new InvalidOperationException("Stripe returned no checkout URL."));
    }

    // Owner decision: user-initiated downgrade is END OF PERIOD. We schedule the Stripe
    // subscription to cancel at period end and KEEP the user on Pro; the actual Free flip
    // arrives later as customer.subscription.deleted. Returns the date Pro access lasts to.
    private async Task<BillingChangeResult> CancelAtPeriodEndAsync(User user, CancellationToken cancellationToken)
    {
        if (user.Plan != Plan.Pro)
        {
            return BillingChangeResult.Applied;
        }

        // No Stripe subscription on record (e.g. a plan set outside Stripe) — flip directly.
        if (string.IsNullOrEmpty(user.StripeSubscriptionId))
        {
            user.Plan = Plan.Free;
            await _userService.UpdateAsync(user, cancellationToken);
            _logger.LogInformation("Downgraded user {UserId} to Free (no Stripe subscription on record)", user.Id);
            return BillingChangeResult.Applied;
        }

        var subscription = await new SubscriptionService().UpdateAsync(
            user.StripeSubscriptionId,
            new SubscriptionUpdateOptions { CancelAtPeriodEnd = true },
            cancellationToken: cancellationToken);

        var periodEnd = PeriodEndOf(subscription) ?? user.CurrentPeriodEnd ?? DateTimeOffset.UtcNow;
        user.CancelAtPeriodEnd = true;
        user.CurrentPeriodEnd = periodEnd;
        await _userService.UpdateAsync(user, cancellationToken);
        _logger.LogInformation(
            "Scheduled Stripe subscription {SubscriptionId} to cancel at period end for user {UserId}",
            user.StripeSubscriptionId, user.Id);

        return BillingChangeResult.ScheduledCancellation(periodEnd);
    }

    private SessionCreateOptions BuildCheckoutOptions(User user)
    {
        var options = new SessionCreateOptions
        {
            Mode = "subscription",
            // Authoritative account identity — the webhook trusts this, never a client email.
            ClientReferenceId = user.Id,
            CustomerEmail = user.Email,
            SuccessUrl = _settings.SuccessUrl,
            CancelUrl = _settings.CancelUrl,
            LineItems = [new SessionLineItemOptions { Price = _settings.ProPriceId, Quantity = 1 }],
        };

        // FR-10 — destination VAT/sales tax calculated & collected. Off by default; the
        // go-live value is an accountant decision. Address collection is required for tax.
        if (_settings.TaxEnabled)
        {
            options.AutomaticTax = new SessionAutomaticTaxOptions { Enabled = true };
            options.BillingAddressCollection = "required";
        }

        // FR-11 (provider side) — Stripe's terms-of-service consent gate. The terms URL is
        // configured in the Stripe Dashboard for hosted Checkout; the in-app CheckoutConsentStep
        // captures the express withdrawal-waiver acknowledgement + "Subscribe & pay" per §6.
        if (_settings.ConsentRequired)
        {
            options.ConsentCollection = new SessionConsentCollectionOptions { TermsOfService = "required" };
        }

        // FR-12 — capture the buyer's tax id (NIP) so subscription invoices are B2B-compliant.
        // Subscription-mode invoices are emitted automatically by Stripe; the invoice template
        // (numbering, seller NIP, VAT breakdown, PLN presentation) is finalized in the Stripe
        // Dashboard at go-live (§7.2). No per-session InvoiceCreation — that is payment-mode only.
        if (_settings.InvoicingEnabled)
        {
            options.TaxIdCollection = new SessionTaxIdCollectionOptions { Enabled = true };
        }

        return options;
    }

    public async Task HandleWebhookAsync(string payload, string signature, CancellationToken cancellationToken = default)
    {
        // (1) Signature FIRST. A bad/forged signature must mutate nothing.
        Event stripeEvent;
        try
        {
            stripeEvent = EventUtility.ConstructEvent(payload, signature, _settings.WebhookSecret);
        }
        catch (StripeException ex)
        {
            // Bad/forged signature → 400 via ErrorHandlingMiddleware. Log the fact, not the payload.
            _logger.LogWarning("Rejected Stripe webhook: signature verification failed ({Message})", ex.Message);
            throw new ValidationException(new Dictionary<string, string[]> { ["webhook"] = ["Invalid webhook signature."] });
        }

        switch (stripeEvent.Type)
        {
            case "checkout.session.completed":
                await ProcessOnceAsync(stripeEvent, OnCheckoutCompletedAsync, cancellationToken);
                break;

            case "customer.subscription.updated":
                await ProcessOnceAsync(stripeEvent, OnSubscriptionUpdatedAsync, cancellationToken);
                break;

            case "customer.subscription.deleted":
                await ProcessOnceAsync(stripeEvent, OnSubscriptionDeletedAsync, cancellationToken);
                break;

            case "invoice.payment_failed":
                // Owner decision (payment-lapse grace): do NOT downgrade here. Let Stripe's
                // dunning/retries run; only customer.subscription.deleted (retries exhausted)
                // returns the account to Free. Do not "fix" this to downgrade on first failure.
                break;

            default:
                // Unhandled event type — ack with 200 so Stripe stops retrying.
                break;
        }
    }

    // (2) Idempotency claim + mutation as ONE unit of work. The idempotency ledger insert
    // and the plan mutation MUST commit atomically: both go through the same scoped
    // TidansuDbContext (the event store and UserManager share it), so a single explicit
    // transaction spans both their SaveChanges calls. If the handler throws, the claim
    // rolls back too — Stripe's at-least-once retry then re-processes cleanly instead of
    // short-circuiting on a claim that was never applied (that lost-upgrade bug is why
    // this is one transaction; do NOT split it back into claim-then-mutate). A concurrent
    // duplicate delivery still fails the unique-PK insert and is skipped as a no-op.
    private async Task ProcessOnceAsync(
        Event stripeEvent,
        Func<Event, CancellationToken, Task> handler,
        CancellationToken cancellationToken)
    {
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

        var claimed = await _eventStore.TryMarkProcessedAsync(stripeEvent.Id, stripeEvent.Type, cancellationToken);
        if (!claimed)
        {
            // Duplicate at-least-once delivery — nothing to commit; the transaction rolls
            // back on dispose and the caller acks 200.
            _logger.LogInformation(
                "Skipping already-processed Stripe event {EventId} ({EventType})", stripeEvent.Id, stripeEvent.Type);
            return;
        }

        await handler(stripeEvent, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    // checkout.session.completed → grant Pro. (3) Resolve the account SOLELY from the
    // ClientReferenceId we set at checkout (the authenticated Tidansu id), never the email.
    private async Task OnCheckoutCompletedAsync(Event stripeEvent, CancellationToken cancellationToken)
    {
        if (stripeEvent.Data.Object is not Session session || string.IsNullOrEmpty(session.ClientReferenceId))
        {
            _logger.LogWarning("checkout.session.completed with no client reference id; ignoring");
            return;
        }

        // Only grant Pro once the payment actually settled. Cards return "paid" here (the
        // normal path); "no_payment_required" covers 100%-off coupons / trials. A delayed
        // (async) payment method can emit this event with status still "unpaid" before funds
        // clear — never promote in that window. Handling the later
        // checkout.session.async_payment_succeeded for those methods is a documented
        // follow-up (see task.md Notes), not in scope here.
        if (session.PaymentStatus is not ("paid" or "no_payment_required"))
        {
            _logger.LogInformation(
                "checkout.session.completed for user {UserReference} not yet paid (status {PaymentStatus}); not granting Pro",
                session.ClientReferenceId, session.PaymentStatus);
            return;
        }

        var user = await _userService.FindByIdAsync(session.ClientReferenceId, cancellationToken);
        if (user is null)
        {
            _logger.LogWarning("checkout.session.completed for unknown user reference; ignoring");
            return;
        }

        user.StripeCustomerId = session.CustomerId;
        user.StripeSubscriptionId = session.SubscriptionId;
        user.CurrentPeriodEnd = await TryGetPeriodEndAsync(session.SubscriptionId, cancellationToken);
        user.CancelAtPeriodEnd = false;
        user.Plan = Plan.Pro;
        await _userService.UpdateAsync(user, cancellationToken);
        _logger.LogInformation("Stripe webhook upgraded user {UserId} to Pro (subscription {SubscriptionId})",
            user.Id, session.SubscriptionId);
    }

    // customer.subscription.updated → track cancel-at-period-end + period end so the app can
    // show "Pro until <date>". Tolerates arriving before checkout persisted the id (no-op then).
    private async Task OnSubscriptionUpdatedAsync(Event stripeEvent, CancellationToken cancellationToken)
    {
        if (stripeEvent.Data.Object is not Subscription subscription)
        {
            return;
        }

        var user = await _userService.FindByStripeSubscriptionIdAsync(subscription.Id, cancellationToken);
        if (user is null)
        {
            _logger.LogInformation(
                "customer.subscription.updated for {SubscriptionId} not yet mapped to a user; ignoring", subscription.Id);
            return;
        }

        user.CancelAtPeriodEnd = subscription.CancelAtPeriodEnd;
        user.CurrentPeriodEnd = PeriodEndOf(subscription) ?? user.CurrentPeriodEnd;
        await _userService.UpdateAsync(user, cancellationToken);
        _logger.LogInformation(
            "Updated subscription state for user {UserId}: cancelAtPeriodEnd={CancelAtPeriodEnd}",
            user.Id, subscription.CancelAtPeriodEnd);
    }

    // customer.subscription.deleted → the SINGLE Free end-state for both user-cancel-at-period-end
    // and dunning-exhausted lapse. Data is untouched (read-only enforcement lives in PlanPolicy).
    private async Task OnSubscriptionDeletedAsync(Event stripeEvent, CancellationToken cancellationToken)
    {
        if (stripeEvent.Data.Object is not Subscription subscription)
        {
            return;
        }

        var user = await _userService.FindByStripeSubscriptionIdAsync(subscription.Id, cancellationToken);
        if (user is null)
        {
            _logger.LogInformation(
                "customer.subscription.deleted for {SubscriptionId} not mapped to a user; ignoring", subscription.Id);
            return;
        }

        user.Plan = Plan.Free;
        user.CancelAtPeriodEnd = false;
        user.CurrentPeriodEnd = null;
        await _userService.UpdateAsync(user, cancellationToken);
        _logger.LogInformation("Stripe webhook downgraded user {UserId} to Free (subscription ended)", user.Id);
    }

    // Period end moved off Subscription onto its items in recent Stripe API versions
    // (Stripe.net 52). Read it from the first item; null-safe for empty/absent items.
    private static DateTimeOffset? PeriodEndOf(Subscription subscription)
    {
        var item = subscription.Items?.Data?.FirstOrDefault();
        return item is null ? null : new DateTimeOffset(item.CurrentPeriodEnd, TimeSpan.Zero);
    }

    // checkout.session.completed carries no period end — fetch the subscription to record it.
    // Best-effort: a display date must never fail the (plan-granting) webhook.
    private async Task<DateTimeOffset?> TryGetPeriodEndAsync(string? subscriptionId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(subscriptionId))
        {
            return null;
        }

        try
        {
            var subscription = await new SubscriptionService().GetAsync(subscriptionId, cancellationToken: cancellationToken);
            return PeriodEndOf(subscription);
        }
        catch (StripeException ex)
        {
            _logger.LogWarning("Could not fetch period end for subscription {SubscriptionId} ({Message})",
                subscriptionId, ex.Message);
            return null;
        }
    }
}
