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

**Two independent gates — do not conflate (B-24):** There are two separate
"over-cap" questions on a space and they must stay separate in requirements:
(1) is *this whole space* one of the account's excess spaces beyond
`caps.spaces` (B-17 SPA / B-24 server) — a space-cap question; (2) does a
space's *own* zone/item count exceed the per-space `zones`/`items` cap — a
content-count question, whose codebase rule (`PlanPolicy.cs`) deliberately
gates **adds only**, never update/delete, so a downgraded Free user with e.g.
8/6 zones can still rename/delete zones (only a 9th add is blocked). B-24
(server-side enforcement mirroring B-17) is entirely about question (1); do
not let it reintroduce an update/delete gate for question (2) — that's an
explicitly-rejected-by-design bug, not a gap. B-24 additionally decided (as an
assumption, PO to confirm) that zone/item **removal** inside an over-cap
space should also be rejected server-side, to match what B-17's SPA already
disables (SPA disables item removal and zone deletion, not just add/edit) —
only whole-space delete is the exempted recovery path.
