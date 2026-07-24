---
name: ci-drift-check-crlf-false-positive
description: Any CI "regenerate + git diff" gate for a committed generated artifact is CRLF-fragile on a Linux runner when the repo has no .gitattributes
metadata:
  type: project
---

A CI drift gate that regenerates a committed artifact on `ubuntu-latest` and fails on a
non-empty `git diff` (B-28's kiota-drift check is the first) can red on a *clean*
artifact via line endings.

**Why:** This repo is developed on Windows with `core.autocrlf=true` and has **no
`.gitattributes`** anywhere. Whether committed blobs are LF depends entirely on each
committer's machine config, not the repo. Today B-28 passes only because all committed
client blobs happen to be `i/lf` (check with `git ls-files --eol -- <path>`). A single
regen-and-commit from an `autocrlf=false` machine writes CRLF blobs; the Linux runner
then compares CRLF (checkout) vs LF (fresh regen) and reports the *entire* artifact as
drift — the "flaky check erodes trust" failure the requirements name.

**How to apply:** When reviewing any new/changed CI gate of shape "regen + diff a
committed generated file," check for a repo-root `.gitattributes` pinning that artifact
to `eol=lf`. If absent, flag Major with the fix: `.gitattributes` (`* text=auto eol=lf`
+ scope the generated paths to `text eol=lf`) then `git add --renormalize .`. Not
Critical if current blobs are all `i/lf` (works today) — it's a latent landmine, so
frame it as "works today, breaks on the next differently-configured commit." Related:
the gate should use `git add -A` + `git diff --cached --quiet` (bare `git diff` misses
added files) and scope PATHS to exactly the committed regen outputs.
