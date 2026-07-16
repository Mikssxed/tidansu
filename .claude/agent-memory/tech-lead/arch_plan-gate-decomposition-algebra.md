---
name: arch-plan-gate-decomposition-algebra
description: Decomposing the whole-graph plan gate into per-mutation checks — the +1-delta algebra, why updates/deletes get no gate at all, and the two photo-transition traps
metadata:
  type: project
---

Whenever a whole-graph plan check (`PlanPolicy.CheckSpaceMutation(plan, before, after)`,
rule: `after > cap ∧ after > before`) is split into per-mutation checks, the
decomposition is **algebra, not judgement** — don't re-derive it, and don't let a
reviewer talk it into a different shape:

- **add one** (`after = before + 1`): `after > before` is *always true*, so the rule
  reduces **exactly** to `before >= cap`.
- **update** (`after = before`) and **delete** (`after = before - 1`): `after > before`
  is *always false* → **never rejected** → the correct implementation is **no gate call
  at all**, not a call that returns null.

**Why this matters:** the "downgrade keeps over-cap content editable" rule is not extra
logic — it's what falls out of updates/deletes having no gate. `count >= cap → reject`
is only the "naive rule that breaks downgraded editing" if someone applies it to
updates. Say this out loud in review; it's the argument that `>= cap` isn't a weakening.
A temporary xUnit equivalence theory (`CheckAddZone(plan,n) == CheckSpaceMutation(plan,
n, n+1)` for n=0…10), deleted alongside the old method, is the cheap proof — and
`tests/Tidansu.Domain.Tests` is the only place in this repo that can host it
([[arch_domain-tests-are-the-only-test-surface]]).

**Photos are a capability, not a count** — and per-entity they expose two traps the
whole-graph count-delta rule hid:
1. **An identical resent photo must read as "no change".** Clients PUT the whole entity,
   so a downgraded Free user renaming a photo-bearing item resends the same photo
   string. "Any non-null photo on Free → reject" makes such items *permanently
   uneditable*. Compare `existing` vs `incoming` ordinally; equal ⇒ allowed.
2. **`null` is the only "no photo" — never `IsNullOrEmpty`.** The whole-graph count is
   `Items.Count(i => i.Photo is not null)`, and `PhotoPolicy.Check("")` returns `Empty`
   (an *invalid photo*, not *absent*). So `""` must count as an added photo, or a Free
   user sending `photo: ""` skips the 403 gate and gets a 400 instead — inverting B-13's
   deliberate gate-before-validate ordering ([[validation-preempts-plan-gate-403]]).

**How to apply:** keep the per-mutation methods pure/static in `Domain/Constants/
PlanPolicy.cs` (unit-testable); feed them **one integer per capped dimension**, sourced
from a `COUNT(*)` projection — never from a graph load
([[read-path-projection-fixes]]). Note per-mutation precedence can legitimately differ
from the genesis check's (B-15's `CheckAddItem` gates photos *before* items, inverting
`CheckNewSpace`'s spaces→zones→items→photos) — flag it as intentional or a reviewer will
read it as a bug.
