# Backlog

The **pm-requirements-analyst** agent reads this file, picks the highest-priority
unprocessed item, and expands it into functional requirements in
`docs/active/requirements.md`.

Each item is a coarse product idea in **business language** — not a technical
task. Keep them small enough to be one feature slice. Mark an item `✅ done`
(don't delete) once it has shipped so history stays readable.

> The long-horizon build lives in [`docs/IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).
> This backlog is for **new feature work on top of the finished v1** — one idea
> per bullet, processed through the agent pipeline (see
> [`.claude/agents/README.md`](../.claude/agents/README.md)).

## Priority order (top = next)

<!-- Add items below. Format:
### [B-N] <one-line title>
**Priority**: P1 (next) | P2 | P3
**Status**: unprocessed | in-progress | ✅ done
<2–4 sentences of product intent in business language. What can the user do that
they couldn't before? Why does it matter? Any known limits/rules.>
-->

### [B-1] Example — item photos on Pro
**Priority**: P1 (next)
**Status**: unprocessed
Pro users can attach a photo to any item so they can recognise it at a glance
in the layout view. Free users see the camera control but hitting it opens the
paywall with `reason: photos`. Photos count toward nothing extra beyond the Pro
gate. This is illustrative — replace with a real backlog item.
