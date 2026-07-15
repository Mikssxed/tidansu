---
name: corroborating-manual-observation-claims
description: When a dev claims "I read the SQL log / drove the app", look for details the plan couldn't have supplied — that's cheap evidence the claim came from observation, not recitation.
metadata:
  type: feedback
---

On LIGHT-path tasks verified manually (no test to re-run), a claim like "I read the EF SQL
log and saw one narrow statement" is unfalsifiable on its face. Don't accept it, but don't
demand a re-drive either — first check whether the claim contains **detail the plan could
not have supplied**.

**Why:** B-14's report quoted `SELECT (SELECT COUNT(*) FROM [Item] …) FROM [Spaces] WHERE
[UserId] = @userId`. The approved `tech-tasks.md` had idealized it as `FROM Items i`. The
real schema is asymmetric — `DbSet<Space> Spaces` exists so the table is `Spaces`, but `Item`
has no DbSet and falls back to its type name (confirmed in the `SpacesZonesItems` migration).
A dev reciting the plan writes `Items`; only a dev reading real output writes `Item`. That
one-character divergence *from the plan's own text* is strong evidence of a genuine read,
obtainable in one grep.

**How to apply:**
- Look for **plan/reality divergences that favour reality**: table names, parameter naming
  (`@__userId_0`), row counts, error text. Recited claims match the plan; observed claims
  match the database.
- Inverse signal: a manual claim that matches the plan's idealized text *word for word* is
  weaker evidence, not stronger. Worth a closer look at the code path.
- This corroborates *that they looked*, not *that the code is right* — still verify the
  mechanism independently (for B-14: `.Select(s => s.Items.Count)` with no `Include` can't
  emit a Photo column, regardless of what any log said).
- Don't inflate a failed corroboration into a finding on its own. Absence of a tell is not
  evidence of fabrication; it just means fall back to reading the code.

Related: [[verify-claims-vs-test-count]] — the same discipline for automated suites
(a green count can hide tautologies, the way a quoted log can hide a recital).
