---
name: plan-limits
description: Tidansu Free/Pro caps and paywall reasons — the core plan-gating rules to apply to every content/capability feature
metadata:
  type: project
---

Tidansu plan model (from CLAUDE.md, kept here as a quick reference for requirements):

- **Free:** 2 spaces, 6 zones/space, 50 items/space, no photos, no sync.
- **Pro:** unlimited spaces/zones/items + photos + sync.
- On hitting a cap, the paywall opens with a `reason` ∈
  `{spaces, zones, items, photos, sync}` and the mutation does **not** happen.
- **Downgrade** keeps data but makes over-cap content **read-only**.

**Why:** Every feature that adds content or capability must state which plan it
belongs to and which paywall `reason` fires. Auth is the exception — see
[[auth-model]] (not plan-gated).
**How to apply:** For each requirement touching content/capability, fill
"Plan & gate" with Free/Pro + the `reason` + downgrade behaviour for that feature.

**Read-only-on-downgrade, confirmed scope (B-17):** "Downgrade keeps data but
makes over-cap content read-only" is enforced per-item-type independently —
B-17 scoped it to the **space** cap only (whole over-cap spaces flagged
read-only), explicitly leaving per-zone/per-item overage *within* an
otherwise-editable space out of scope (still covered by the existing
add-guards alone). Deterministic "which ones are over-cap" = the existing
stable server list order (`GetSpaces` is `OrderBy(s => s.Id)`, ids are
client-generated `space_...` strings, not creation-time-sortable) — first
`caps.spaces` entries in that order are editable, the rest read-only; this is
a live/reactive computed off `session.caps` + the spaces list, never a
snapshot taken at downgrade time. Read-only means content can't be *changed*;
it does not mean hidden — viewing, list/layout switching, and **deleting**
(the FAQ-promised in-product recovery path back under the cap) all stay
available on a read-only space. Confirmed via `PricingView`'s own FAQ copy:
"Spaces and items beyond the Free limits become read-only until you're back
under the cap or upgrade again."
