---
name: validation-preempts-plan-gate-403
description: FluentValidation runs before handlers, so a validator 400 preempts the handler's PlanLimitException 403 — plan-gated fields (photos) must be checked IN the handler, after the gate
metadata:
  type: project
---

Plan gates live in the **handlers** (`PlanPolicy.Check…` → `throw
PlanLimitException(reason)` → 403 `{plan:[reason]}`), but FluentValidation runs as a
MediatR **pipeline behavior — strictly before the handler**. So a validator 400 beats
the paywall 403 for any field that is both validated and plan-gated.

**Why:** it's easy to write a requirement (B-13's FR-4 did) assuming "the paywall opens
before the validation even runs." It doesn't. **The human's ruling on B-13: the paywall
must win** — a Free user sending a photo, valid or invalid, gets 403. So a check on a
plan-gated field **must live in the handler, after the plan gate** — not in a validator.
Non-gated fields (lengths, tags, rect) stay in FluentValidation.

**How to apply:**
- Plan-gated field → handler-side guard, called *after* `PlanPolicy` and *before* any
  write or entity mutation (in Update, before mutating the EF-tracked entity). In
  `CreateSpaceCommandHandler`, keep it **outside** B-12's `sp_getapplock`
  (`AddWithinSpaceCapAsync`) — never hold a per-user DB lock while scanning payloads.
- Throw `Tidansu.Domain.Exceptions.ValidationException(Dictionary<string,string[]>)` —
  **never invent a new exception type**. It is exactly what `ValidationBehavior` throws,
  so the 400 shape provably can't fork. Precedent for throwing it outside a validator:
  `UserService`, `StripeBillingService`.
- **Error keys:** `StringExtensions.ToCamelCase` lowercases **only the first char**, so
  `Space.Items[3].Photo` → `space.Items[3].Photo` (NOT `space.items[3].photo`). Match
  FluentValidation's `PropertyName` format exactly.
- Hand-built error paths are where payload-echo leaks appear — fixed const messages
  only; the key carries the attribution, the message carries no data.
- `PlanPolicy` counts photos as `Photo is not null`, so an **empty string counts as a
  photo** and hits the plan gate first.

**Placement does NOT affect testability** — see
[[arch-domain-tests-are-the-only-test-surface]] for the corrected reasoning.
