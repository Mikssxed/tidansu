---
name: review-recurring-frontend-findings
description: Recurring frontend review findings in Tidansu — split class bindings defeating twMerge, semantic icon collisions with the paywall padlock, idempotent-constant "latch" tests that prove nothing
metadata:
  type: project
---

Checks that have caught real findings in this repo's Vue diffs, worth running every review.

**1. Split `class` + `:class` on one element.** `twMerge` only sees the binding it is
called in, so a static `class="… bg-surface-2 …"` alongside `:class="classes"` containing
`bg-warn/10` leaves both background utilities in the DOM; the winner falls out of
`style.css` declaration order, not author intent. House pattern is one merged `:class`
(`BaseBadge.vue:29-34`). Found in B-19's `BaseToast.vue`.
**Why:** renders correctly by accident, breaks silently when theme tokens are reordered.
**How to apply:** on any new `components/base/*.vue`, check the root element has exactly
one class binding. Rule now also written into `.claude/context/patterns.md`.

**2. The `lock` icon is reserved vocabulary.** In this app the padlock means "plan cap /
Pro-gated" everywhere (`data/paywall.ts`, `SpaceReadonlyBadge`, `DashboardView` at-limit
tile, `ItemDetailModal` photo lock, `AccountView`, `PricingView`). Using it on a *non-plan*
surface silently undoes work whose entire point was separating the two.
**Why:** B-19 got the plan-vs-generic separation right in control flow, then collapsed it
visually.
**How to apply:** grep existing uses of any icon a diff introduces before accepting it.
**Update (B-19 shipped):** `src/components/icons.ts` now has an `alert` triangle, added
precisely for this — non-plan failure surfaces should use `alert`, and `lock` stays
reserved for plan gates. The old "no warning glyph exists, so raise it as a scope
decision" caveat no longer applies; a diff using `lock` for a generic error is now just a
finding with a one-word fix.

**3. "Coalescing latch" tests that assert an idempotent constant.** A guard like
`if (ref.value !== null) return;` before `ref.value = SOME_CONSTANT` is unobservable —
deleting the guard passes every test, and even a `watch` counter can't see it because Vue
refs skip `Object.is`-equal writes.
**Why:** B-19's test docblock claimed to prove coalescing "deterministically" and did not.
**How to apply:** when a test claims to prove a guard, mentally delete the guard and ask
whether the assertions still pass. Do not mutate source files to check this — the sandbox
classifier blocks edit-then-revert loops on tracked source; reason it through instead.

Related: [[review-tidansu-pipeline-context]]
