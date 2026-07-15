### 📋 Backlog Item
Produce the account page's three usage numbers (spaces, total items, fullest
space's item count) from a cheap aggregate instead of loading every space,
zone, item, and embedded item photo into memory just to count them.

### 🎯 Product Context Summary
This is a pure performance fix with **zero user-visible behaviour change**: the
same three numbers must appear, for every account shape, exactly as they do
today — only how they're produced changes. It's a Free/Pro plan-limit read
path (these numbers drive the paywall meters and cap checks), so correctness
here is load-bearing for plan fairness even though nothing about the plan
rules themselves changes. No new capability, no new paywall `reason`, no
schema or API-shape change.

### 🔑 Core Functional Areas
- Usage-count correctness (same three numbers, every account shape)
- Scope across all three surfaces that return these numbers (account page,
  plan-change response, sync-toggle response)
- Zero-data and tie edge cases
- Non-regression of plan-cap/paywall checks that read these same counts

---

### Functional Requirements

**Usage projection correctness**
- **FR-1**: The account page must continue to show the user's space count,
  total item count across all spaces, and the item count of their single
  fullest space — identical to today's values — no matter how those numbers
  are produced internally.
  - *Business rationale*: Users and the paywall UI depend on these numbers
    being trustworthy; a silent miscount would misrepresent how close someone
    is to their plan's limits or their standing usage.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Applies identically to Free and Pro; not itself gated (it's
    the read path that *feeds* the spaces/items paywall checks, not a gated
    feature).
  - *Constraints/Rules*: No change to which numbers are shown or their
    meaning. No change to the account response shape (confirmed: no Kiota
    regen needed).
  - *Acceptance criteria*: For a matrix of account shapes (see edge cases
    below), the three displayed numbers are bit-for-bit identical to what the
    current full-graph computation would have produced.

**Edge cases the fix must not break**
- **FR-2**: The following account shapes must each resolve to a correct,
  non-error result:
  - Zero spaces → `0 / 0 / 0` (no error, no null).
  - One or more spaces where every space has zero items → total items `0`,
    fullest space `0`.
  - Several spaces with differing item counts → total items sums correctly;
    fullest space equals the single highest count.
  - Two or more spaces tied for the highest item count → fullest space equals
    that shared count (which space "wins" the tie is irrelevant — the number
    is the same either way).
  - Deleted spaces: **resolved at the requirements gate — no soft-delete or
    archive state exists.** The `Space` entity has no `IsDeleted`/`DeletedAt`/
    `Archived` field and the codebase has no EF query filters, so deletes are
    hard and there is no inclusion rule to replicate. A deleted space is simply
    absent from the table.
  - *Priority*: Phase 1 (Core)
  - *Acceptance criteria*: Each shape above is covered by an explicit,
    observable check producing the expected numbers with no exception thrown.

**Scope: all three surfaces that emit these numbers**
- **FR-3**: The account-usage numbers returned by (a) loading the account
  page, (b) changing plan (upgrade/downgrade/cancel-scheduling), and (c)
  toggling sync must all be produced the same cheap way and must all stay
  correct — not just the account page.
  - *Business rationale*: All three responses feed the same account-page UI
    with the same meters; a user who changes plan or toggles sync expects to
    immediately see accurate, up-to-date usage in the response, exactly as
    they do today. Fixing only one of the three would leave two call sites
    still paying the full-graph cost (and leave the audit finding only
    partially resolved).
  - *Priority*: Phase 1 (Core) — this is the scope decision the task.md notes
    flagged; it is confirmed in-scope for all three, not just the named one.
  - *Plan & gate*: No gate change. Downgrade/sync-off flows still return
    correct usage so over-cap content is still identifiable as read-only by
    the existing cap logic.
  - *Constraints/Rules*: All three call sites currently share one shared
    computation seam (count spaces, sum items, max items per space); all
    three should be brought onto the cheap path together so no call site is
    left on the expensive one.
  - *Acceptance criteria*: Loading the account page, changing plan, and
    toggling sync each return usage numbers matching the full-graph
    computation's output, for the same edge-case matrix as FR-2.

**Non-regression of plan caps and paywall behaviour**
- **FR-4**: Every place that decides "is this account over/at a plan limit"
  (space cap, zone cap, item cap, photo/sync gates) must keep making that
  decision from the same correct counts as before.
  - *Business rationale*: These counts aren't just cosmetic — they're read
    directly by the cap checks that fire the paywall. A miscount could let a
    Free user exceed a cap unnoticed, or wrongly block a user who's still
    under it.
  - *Priority*: Phase 1 (Core)
  - *Plan & gate*: Free: 2 spaces / 6 zones per space / 50 items per space
    caps; Pro: unlimited. Paywall `reason` values (`spaces | zones | items |
    photos | sync`) fire exactly as they do today.
  - *Constraints/Rules*: No change to cap thresholds or gate logic — this
    item only changes how the underlying counts are computed, never what
    they mean or how they're checked.
  - *Acceptance criteria*: Cap-boundary scenarios (e.g. a Free user at exactly
    2 spaces attempting a 3rd, at exactly 50 items in a space attempting a
    51st) still trigger the paywall exactly as before.

---

### ⚠️ Key Business Considerations
- **Invisibility is the success criterion.** There is no new feature to show a
  product owner — success means a human (or a diff of before/after responses)
  cannot tell the difference in behaviour, only in load/response cost.
- **Plan fairness depends on this being exactly right.** Because these same
  counts feed the paywall gates, any drift between "what the user sees" and
  "what the cap check uses" would be a trust problem, not just a display bug.
- **Don't let scope quietly shrink to one call site.** The backlog text names
  only the account page; the same wasteful pattern is duplicated three times.
  Confirmed in scope: all three (account page load, plan change, sync toggle).

### 🚫 Out of Scope (Phase 1)
- `GetSpacesQueryHandler` — legitimately needs the full space/zone/item graph
  for the layout view; not part of this fix (per task.md notes).
- Slimming photo payloads in general (data-URL blobs on the layout/read path)
  — that's B-16, a separate task.
- Any change to cap thresholds, paywall UX, or the account response shape.

### ❓ Open Questions for Product Owner
Both resolved at the requirements gate (2026-07-15) — none outstanding.

1. ~~Scope: all three call sites as one task, or three tickets?~~
   **Resolved: all three in one task** (account page, `ChangePlan`, `SetSync`).
   They return the same numbers to the same UI; fixing one leaves SC-1 two
   thirds open. See FR-3.
2. ~~Is there a soft-delete/archived-space state to replicate?~~
   **Resolved: no.** `Space` has no `IsDeleted`/`DeletedAt`/`Archived` field
   and there are no EF query filters anywhere in the codebase — deletes are
   hard. The cheap count is a straight count with no inclusion rule to match.
   See FR-2.
