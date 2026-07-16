---
name: granular-endpoints-b15
description: B-15 scoping — a real architecture/capability change (not LIGHT-path); confirmed product decisions on cascade deletes, ownership error shape, and whole-space PUT retirement
metadata:
  type: project
---

B-15 (replace the whole-space delete-all/re-insert save with granular per-zone/
per-item endpoints) does **not** fit any of the LIGHT-path short-note shapes in
[[webhook-hardening-b9]], [[race-condition-hardening-b12]],
[[dependency-bump-b11]], [[usage-counts-projection-b14]]. It changes the API
surface (new granular endpoints), decomposes real plan-gating logic (one
whole-graph check → many per-mutation checks that must sum to the same
guarantee), and changes user-visible failure granularity (partial-batch
failure becomes possible). Got the full multi-phase FR template.

**Confirmed product decisions from this scoping pass (2026-07-15), useful
precedent for future spatial-model tasks:**
- **Cascade delete:** deleting a zone deletes the items placed inside it — this
  was already true as an implicit side effect of the whole-space replace (the
  frontend's `deleteZone` filters items client-side before resending the whole
  graph); B-15 makes it an explicit, named, testable server behaviour instead
  of an accident of the old save shape.
- **Cross-user/unknown-id ownership errors:** standardized on "not found" for
  *both* an id belonging to another user and a truly nonexistent id — never a
  distinct 403 that would let a caller infer "that id exists, it's just not
  yours." This matches the existing space-level convention (`GetByIdAsync`
  already filters by owner in the query, so a stranger's space and a
  nonexistent one are indistinguishable to the caller) and was extended to the
  new per-zone/per-item endpoints as the default going forward.
- **Space scalar fields need their own update path**, separate from
  zone/item endpoints — otherwise renaming a space or switching view/canvas
  mode still forces a full zone/item resend as a side effect of save
  batching, which would defeat the point of a "granular endpoints" task. Any
  future task that reworks the space-level save path should check whether
  scalar-field edits are still riding along on a heavier endpoint.
- **Whole-space PUT retirement, not coexistence** — recommended (and adopted
  into the task's Notes, pending final PO sign-off) because Tidansu has a
  single API consumer (the SPA) and keeping both paths means maintaining two
  parallel plan-cap enforcement implementations that could drift out of sync.
  General principle for future "add granular X" tasks in this repo: prefer
  retiring the coarse-grained predecessor in the same task rather than lingering
  dual paths, *specifically because* this app has no external API consumers to
  protect via a deprecation window — re-evaluate this default if that ever
  changes.

**Why:** recorded 2026-07-15 to keep the LIGHT-path memory set from
over-generalizing (this is explicitly the heavy-template case) and to pin
product decisions (cascade delete, error-shape convention, scalar-field
endpoint) that a tech-lead or future PM pass on the spatial model should reuse
rather than re-derive.

**How to apply:** when scoping a task that decomposes an existing
whole-graph/whole-resource mutation into granular per-child-entity endpoints,
default to the full FR template (not a short note), explicitly separate
"entity-collection mutations" from "the parent resource's own scalar fields"
as distinct functional areas, and reuse the "not found" (never a distinct
403) convention for any new per-entity ownership check unless a specific
reason argues otherwise.
