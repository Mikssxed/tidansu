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
