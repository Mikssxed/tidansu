---
name: unique-index-dedupe-no-catch
description: check-then-insert dedupe backed by a unique index throws an unhandled DbUpdateException (500) under a race unless the insert is caught
metadata:
  type: feedback
---

When a handler dedupes with `ExistsAsync` → `AddAsync` and the table has a unique
index enforcing the same rule, verify the insert is wrapped in
`try/catch (DbUpdateException)`. Without the catch, two concurrent requests both pass
the existence check, both insert, and the loser throws → mapped to a 500.

**Why:** B-29's `ConsumeMagicLinkCommandHandler` had exactly this shape on the
sign-in hot path; the tech-task even claimed the unique constraint "beats a
check-then-insert TOCTOU" — but a raw constraint violation is a 500, not a graceful
dedupe. A constraint that "atomically enforces" a rule still needs a catch to be
*graceful*. Related: [[sp-getapplock-return-code-check]], [[collation-vs-ordinal-uniqueness-checks]].

**How to apply:** On any consume/create path with a unique index doing double duty as
a dedupe, trace the race window (is the guarding read in the same transaction as the
insert? is the row single-use / superseded elsewhere?). If a concurrent path can reach
the insert twice, flag the missing catch as Major when it lands on auth or another
"no regression" contract; Minor when the path is well-guarded upstream (e.g. token
supersession leaves only a same-token double-submit window).
