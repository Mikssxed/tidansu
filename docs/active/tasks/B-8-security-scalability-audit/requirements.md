# B-8 · Security & Scalability Audit — Scoping Note

This is an **audit**, not a feature build. There is no functional-requirements
decomposition here and no downstream tech-lead/developer stage — the
deliverable is a single prioritized findings report (`review.md`). This note
scopes the audit itself: what to look at, how to grade what's found, how to
write it up, and what's explicitly out of bounds.

## 1. Audit scope & lenses

Run whole-codebase (main is clean/merged; a branch diff would be empty), across
three lenses:

**Backend security** — `src/Tidansu.Application`, `src/Tidansu.API`,
`src/Tidansu.Infrastructure`
- IDOR/ownership: can a user read/mutate a space/zone/item they don't own, by
  guessing or supplying another user's id? Check every command/query handler
  that takes a space/zone/item id.
- Plan-limit bypass: can the 2-spaces / 6-zones-per-space / 50-items-per-space /
  no-photos / no-sync Free caps be circumvented (race, missing server-side
  check re-validated client-side only, downgrade not enforced read-only)?
- Auth/token handling: JWT issuance/validation, magic-link single-use + 15-min
  expiry + supersede-on-resend, refresh/rotation if present, rate limiting on
  auth endpoints.
- Billing/webhook integrity: Stripe webhook signature verification, replay
  protection, idempotency of plan-state transitions.
- Input validation: FluentValidation coverage on all commands, missing bounds
  (string length, numeric ranges, rect/position sanity for zone layout).
- Redirect safety: any user-controlled redirect/return-url (magic-link
  callback, OAuth-style flows if any) checked against open-redirect.

**Scalability** — `src/Tidansu.Infrastructure` (EF Core / `TidansuDbContext`),
handlers
- N+1 query patterns (e.g. loading zones/items per-space in a loop rather than
  a single query).
- Missing indexes on foreign keys / frequently filtered columns (owner id,
  space id, zone id, expiry date).
- Unbounded payloads: list endpoints without paging/limits that could return
  unbounded rows as data grows.
- Per-request work that won't hold under load (synchronous heavy work on the
  request thread, missing caching of static lookups).

**UI/UX correctness** — `src/Tidansu.App`
- A correctness sweep (not a redesign): broken states, paywall gates that don't
  actually block the underlying action, read-only-after-downgrade not reflected
  in the UI, error states swallowed silently, template-purity/style violations
  that indicate a functional bug rather than a static rule violation.

## 2. Severity rubric

- 🔴 **Critical** — exploitable *right now* with no special conditions: data
  exposure across accounts, auth bypass, plan-limit bypass with no client
  workaround needed, payment/webhook forgery.
- 🟠 **Major** — exploitable under specific but plausible conditions (timing/
  race, requires a crafted request but no special access), or a clear
  scalability cliff that will bite at realistic (not extreme) data volumes.
- 🟡 **Minor** — hardening / defense-in-depth / nit: no direct exploit path
  today, or a UX rough edge that doesn't cause data loss or incorrect access.

## 3. Report format

Each finding in `review.md` must contain:
- Severity (🔴/🟠/🟡)
- Location: `file:line`
- Concrete failure scenario (what a user/attacker does, what goes wrong)
- Recommended fix (plain description, not a diff)
- Whether it's a candidate follow-up backlog item (Critical/Major findings
  should be, with a suggested title/one-liner ready to paste into
  `docs/backlog.md`)

Group findings by lens (Security / Scalability / UI-UX) with a short summary
count (e.g. "2 Critical, 3 Major, 5 Minor") at the top.

## 4. Out of scope / already carved off

- **[B-9]** Stripe webhook rate-limit + body cap, **[B-10]** async Stripe
  payment methods, **[B-11]** NU1903 dependency bumps — these are known,
  already-filed follow-ups from the B-6 security review. Reference them by id
  if the audit resurfaces the same surface; do not re-file as new findings.
- No new feature requirements, no UI redesign, no tech-lead task list — this
  task has no build stage.
- Per user decision: trivial findings (~≤30 LOC, no design judgement call, e.g.
  a missing null-check or an obviously-wrong validation bound) may be fixed
  inline during this task. Anything Critical or Major, or requiring a design
  decision, is written up and deferred to a new follow-up backlog item — not
  fixed here.

## 5. Definition of done

- `review.md` exists with all three lenses covered and a summary count.
- Every finding has severity, `file:line`, failure scenario, and recommended
  fix.
- The six named security surfaces (IDOR/ownership, plan-limit bypass, auth/
  token handling, billing/webhook integrity, input validation, redirect
  safety) and four named scalability surfaces (N+1, indexes, unbounded
  payloads, per-request load) are each explicitly addressed (even if "no
  finding").
- Critical/Major findings are listed as candidate follow-up backlog items
  (title + one-liner), not filed as new issues by this task.
- No code changes ship under this task except trivial inline fixes per §4.

## Open questions for product owner

- Confirm the ≤30-LOC / "no design judgement" bar for inline fixes is still
  the right line, or whether any inline fix should require a stop-and-ask
  regardless of size (e.g. anything touching auth or billing).
- Confirm whether UI/UX correctness findings that overlap with known
  low-priority backlog polish items (if any exist) should be folded into this
  report or left to their own items.
