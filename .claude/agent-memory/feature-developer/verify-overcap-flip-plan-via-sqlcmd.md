---
name: verify-overcap-flip-plan-via-sqlcmd
description: fastest way to get a Free user past their own space/zone/item cap for over-cap verification — flip Plan to Pro via sqlcmd, create the content, flip back
metadata:
  type: project
---

To verify B-24's server-side over-cap gate (Free plan, `caps.spaces = 2`, needed
5+ spaces to have both under-cap and over-cap ranks), the create-space endpoint
itself enforces the cap — a Free user cannot POST past 2 spaces to set up the
over-cap fixture in the first place. The unblocker: `sqlcmd` directly against the
LocalDB dev DB (see [[sqlcmd-quoted-identifier-inline-query]]) to flip
`AspNetUsers.[Plan]` to `'Pro'`, create as many spaces/zones/items as needed
through the real API (so ids, ownership, etc. are all realistic), then flip
`[Plan]` back to `'Free'` before driving the actual over-cap assertions.

**Why:** this is the only way to construct an "over-cap after downgrade" fixture
without a real Stripe downgrade webhook — and it exercises the exact same code
path (`PlanCaps.For(user.Plan)`) a real downgrade would.

**How to apply:** `sqlcmd -S "(localdb)\MSSQLLocalDB" -d TidansuDb -Q "SET QUOTED_IDENTIFIER ON; UPDATE AspNetUsers SET [Plan]='Pro' WHERE Email='...'"`,
create content via the running API with the existing bearer token (no new token
needed — plan is read fresh per request, not cached in the JWT), then flip back
to `'Free'` the same way before asserting the over-cap 403s. Also useful:
`SELECT Id, Name FROM Spaces WHERE UserId=... ORDER BY Id` to read the exact rank
order the server (and the SPA) will use, so the over-cap fixture's expected ranks
are computed from data, not assumed from creation order (`Space.Id` is a
CSPRNG-generated string as of B-23, so alphabetical rank does not track creation
order).
