# Tidansu — Domain Model (Ubiquitous Language)

Tidansu is a **spatial inventory app**. Users map physical storage as real layouts
and track what's inside, including expiry dates.

## Core Entities

| Term | Meaning |
|------|---------|
| **Space** | A physical storage container (fridge, freezer, cellar, cabinet, pantry, drawer, etc.). A user has many spaces. |
| **Zone** | A sub-region within a space, positioned as a rectangle on the space's layout. Zones have a name and a color variant. |
| **Item** | A thing stored in a zone. Has a name, optional photo, optional expiry date, and possibly a quantity. |
| **Space Type** | A template defining the default zones and layout for a kind of space (e.g. "fridge" → shelves + drawers). |
| **Plan** | Free or Pro. Gates features via caps, not toggles. |

## Plans

| Plan | Spaces | Zones/Space | Items/Space | Photos | Sync |
|------|--------|-------------|-------------|--------|------|
| **Free** | 2 | 6 | 50 | No | No |
| **Pro** | Unlimited | Unlimited | Unlimited | Yes | Yes |

**Paywall `reason`** values: `spaces`, `zones`, `items`, `photos`, `sync`.

**Downgrade rule:** keeps data but makes over-cap content **read-only**.

## Auth

Passwordless magic-link sign-in. **NOT plan-gated.** Single-use link, 15-min expiry,
new request supersedes prior active links.

## Expiry

Items can have an expiry date. States: valid, soon-expiring, expired. Drives UI
coloring and sorting.

## Sharing (future)

A space can be shared with other users. Permissions: view / edit. Not yet implemented.

## Sync (future)

Cross-device sync via a backend service. Not yet implemented.

## Billing

Stripe recurring subscription (Free → Pro). Webhook is the sole Pro authority.
`checkout.session.completed` grants Pro; `customer.subscription.deleted` downgrades.
