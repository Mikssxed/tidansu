---
name: scoped-space-keys-b23
description: B-23 (Space.Id cross-tenant collision DoS, one level up from B-22) — no composite-key option exists for the tenancy root, so requirements must leave the id strategy open
metadata:
  type: project
---

B-23 is the identical bug B-22 fixed for Zone/Item (client-supplied, globally-unique
id → cross-tenant DoS + 200-vs-500 existence oracle), but on `Space`, the tenancy
root. Unlike Zone/Item, **there is no parent id to scope a composite key against**
— `Space` has no `SpaceId`-equivalent to combine with `Id`. The real fix is one of:
(a) server-assign the id (no optimistic-add constraint blocks this — space create
responses already return the full DTO before any child rows exist to attach), or
(b) key by `(UserId, Id)`, keeping the client-supplied id but scoping it to the
owner, which does affect the optimistic-add UX path.

**How to apply:** requirements must NOT pick between (a)/(b) — state both as
satisfying every functional requirement and surface the choice as an explicit open
question for tech-planning, per the task brief's own instruction not to assume
B-22's answer transfers. Treat existence-oracle closure (FR distinct from
"no error") and rate-limiting `POST /api/spaces` (independent of whichever id fix
is chosen — it's what makes bulk squatting cheap on unlimited-space Pro accounts)
as their own standalone FRs, same pattern as [[scoped-keys-migration-b22]]. Full FR
template used (data migration + tenancy-root surface), not the LIGHT-path.

Also: B-22 left comments claiming tenant isolation is "structural"/complete that
are actually Zone/Item-only and read as repo-wide — this task's acceptance
criteria should include correcting those comments so the gap doesn't reappear as
a trap for the next reader (same lesson as B-22's own S-L2 finding on itself).
