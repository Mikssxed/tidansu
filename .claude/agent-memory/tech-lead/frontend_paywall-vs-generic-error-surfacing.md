---
name: frontend-paywall-vs-generic-error-surfacing
description: A generic "didn't save" surface must never co-occur with the paywall — enforce it structurally by raising only inside the existing else branch of the planReasonOf check
metadata:
  type: project
---

Whenever a client-side failure path gains a **generic user-visible error surface**
(toast/banner), the raise call goes **only inside the existing `else` branch** of the
`planReasonOf(error)` check — never before it, never as a separate `if (!reason)`.

**Why:** every optimistic mutation path in `useSpacesStore` already forks into
"plan cap → `openPaywall(reason)`" vs "anything else → `console.error`". The paywall
fully explains a cap failure; layering a vaguer message on top confuses the user about
*why* the change failed and cheapens the paywall's specificity. Putting the raise in
the `else` makes the exclusivity a property of the control flow rather than a second
condition a later edit can silently desynchronize. A duplicated `if (!reason)` check
looks equivalent but rots independently.

**How to apply:** applies to any of the three post-B-15/16 failure paths
(`handleCreateError`, `handleDeleteError`, `recordFailure`) and to any future store
that pairs an optimistic mutation with a plan gate. Corollaries learned on B-19:
- Delete paths never trip a cap, so they have no plan branch — raise unconditionally.
- Do not raise a generic message from a *read* failure (`hydrate`) that already has a
  dedicated retry affordance (B-18 `isHydrateFailed`) — that is also double-surfacing,
  and the retry UI is strictly more actionable.
- Coalescing (when required) belongs in a single private raiser with an early return,
  not re-checked at each call site.

Related: [[validation-preempts-plan-gate-403]] (the server-side sibling: a 400 beating
the paywall 403), [[frontend_downgrade-readonly-seam]].
</content>
