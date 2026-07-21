---
name: scoped-keys-migration-b22
description: full-FR-template scoping decision for B-22 (composite-key cross-tenant fix + schema/data migration); when a security fix requires a real data migration it breaks from the LIGHT-path short-note pattern
metadata:
  type: project
---

B-22 (scope Zone/Item ids to their owning space via a composite key, closing a
cross-tenant id-collision DoS + existence oracle) got the **full multi-phase FR
template**, not the LIGHT-path short note used for [[race-condition-hardening-b12]],
[[webhook-hardening-b9]], [[dependency-bump-b11]], and the audit-type pattern in
[[security-scalability-audit-b8]].

**Why:** those LIGHT-path items were all guard-adds, event-handler-adds, version
bumps, or atomicity fixes with no schema/data migration and no risk of losing
existing user content. B-22 requires an EF schema migration (`HasKey` change) plus
a **data migration for existing rows**, and the task's own filing calls the
migration "real work, not a footnote" expected to dominate the task. Any task
where existing user data must be re-shaped/re-pointed carries genuine loss risk
(zones, items, and photo blobs surviving intact, layouts rendering unchanged) —
that risk deserves first-class FRs with concrete acceptance criteria (sample
spaces across Free/over-cap-readonly/Pro-with-photos, pixel-identical layout,
production-shaped data rehearsal) rather than being folded into a short note.

**How to apply:** when scoping a security/correctness fix, check whether it implies
a **data migration for existing rows** (not just a schema/contract change with no
existing rows affected). If yes, default to the full FR template and make
"existing content survives unchanged" its own top-priority FR with acceptance
criteria naming specific representative data shapes to verify (at-cap, over-cap
read-only from downgrade, Pro-with-photos) — do not let migration safety get
folded as a bullet under a broader FR.

Also confirmed for B-22: an existence-oracle closure (200-vs-500 revealing
whether an id exists elsewhere) is itself worth a standalone FR distinct from
"the collision doesn't error" — the two are separable claims (no error vs. no
information leak) even when one fix (composite key) happens to address both.
