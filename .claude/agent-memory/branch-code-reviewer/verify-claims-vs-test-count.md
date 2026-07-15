---
name: verify-claims-vs-test-count
description: A green "N/N tests" claim can hide tautological tests. Check what each new test can actually fail on before crediting the count as coverage.
metadata:
  type: feedback
---

When a task's verification section leads with "N/N tests green", spot-check the new tests
for **tautologies** before treating the number as coverage.

**Why:** B-13's headline was "57/57 Domain tests green", but 6 of them were
`All_PhotoRejection_values_are_reachable` — `[InlineData(SomeEnum.Member)]` × 6 asserting
`Enum.IsDefined(value)`, which the compiler already guarantees. The test name claimed
reachability it never exercised. Same file's `Constants_match_…` re-asserted each constant
against its own defining literal (a change-detector, marginal but not worthless).

**How to apply:**
- Ask of each new test: *what edit would make this go red?* If the answer is "none" or
  "only editing this literal", it's padding — 🟡 Minor, recommend deletion or a real
  assertion (e.g. assert the set of outcomes observed across the table equals
  `Enum.GetValues<T>()`).
- Conversely, **credit** tests that pin a *derived relationship* rather than a literal.
  B-13's `Check_accepts_a_decoded_size_exactly_at_the_cap` builds a real `MaxPhotoBytes`-sized
  PNG, so bumping one constant without the other goes red — that's what protects a
  two-constant invariant, not the constant-equality test that claims to.
- Don't let this become a reflex to distrust green suites. B-13's suite was genuinely good
  (real magic-byte fixtures, cap pinned on both sides); the padding was the exception.

Related: [[fluentvalidation-must-nre-on-json-null]]
